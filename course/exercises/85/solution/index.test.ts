import { test } from "vitest";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createTracer, GEN_AI, maskFreeText, pseudonymise, safeLogRecord, summariseTrace, withSpan } from "./index.ts";

function fixture() {
  let clock = 1000;
  let next = 0;
  const tracer = createTracer({ now: () => clock, newId: () => `id${++next}` });
  return { tracer, advance: (ms: number) => (clock += ms) };
}

test("child spans share the trace, point at their parent and measure duration", () => {
  const { tracer, advance } = fixture();
  const request = tracer.startSpan("rag.request", { attributes: { "app.route": "/answer" } });
  const retrieve = tracer.startSpan("rag.retrieve", { parent: request });
  advance(120);
  retrieve.setAttribute("rag.top", 5);
  retrieve.end();
  request.end();
  assert.deepEqual(tracer.finished(), [
    { traceId: "id1", spanId: "id3", parentSpanId: "id2", name: "rag.retrieve", startMs: 1000, endMs: 1120, durationMs: 120, status: "ok", attributes: { "rag.top": 5 } },
    { traceId: "id1", spanId: "id2", name: "rag.request", startMs: 1000, endMs: 1120, durationMs: 120, status: "ok", attributes: { "app.route": "/answer" } },
  ]);
});

test("ending twice records once, and attributes after end are ignored", () => {
  const { tracer } = fixture();
  const span = tracer.startSpan("once");
  span.end();
  span.setAttribute("late", true);
  span.end();
  assert.equal(tracer.finished().length, 1);
  assert.deepEqual(tracer.finished()[0].attributes, {});
});

test("withSpan ends the span on success and records the error name on failure", async () => {
  const { tracer, advance } = fixture();
  const root = tracer.startSpan("rag.request");
  assert.equal(await withSpan(tracer, "rag.retrieve", root, async () => { advance(50); return 3; }), 3);
  await assert.rejects(
    withSpan(tracer, "rag.generate", root, async () => {
      advance(900);
      throw new TypeError("provider exploded");
    }),
    TypeError,
  );
  root.end();
  const [retrieve, generate] = tracer.finished();
  assert.equal(retrieve.status, "ok");
  assert.equal(retrieve.parentSpanId, root.spanId);
  assert.equal(generate.status, "error");
  assert.equal(generate.error, "TypeError");
  assert.equal(generate.durationMs, 900);
});

test("a trace summary adds up tokens across model calls and finds the slowest stage", async () => {
  const { tracer, advance } = fixture();
  const root = tracer.startSpan("rag.request");
  await withSpan(tracer, "rag.retrieve", root, async () => void advance(80));
  for (const [ms, input, output] of [[400, 1200, 150], [700, 900, 300]]) {
    await withSpan(tracer, "gen_ai.chat", root, async (span) => {
      advance(ms);
      span.setAttribute(GEN_AI.model, "chat-v1");
      span.setAttribute(GEN_AI.inputTokens, input);
      span.setAttribute(GEN_AI.outputTokens, output);
    });
  }
  root.end();
  const other = tracer.startSpan("unrelated");
  other.setAttribute(GEN_AI.inputTokens, 99999);
  other.end();
  assert.deepEqual(summariseTrace(tracer.finished(), root.traceId), {
    totalMs: 1180,
    inputTokens: 2100,
    outputTokens: 450,
    llmCalls: 2,
    slowestChild: "gen_ai.chat",
    errors: 0,
  });
  assert.throws(() => summariseTrace(tracer.finished(), "missing"), /no root span/);
});

test("structured logs keep allow-listed fields, pseudonymise IDs and drop prompts and PII", () => {
  const record = safeLogRecord(
    "rag.answer",
    {
      userId: "u-ana",
      tenantId: "northbank",
      latencyMs: 1180,
      cached: false,
      outcome: "answer from jane.doe@example.com thread",
      note: "card 4111 1111 1111 1111 to GB82 WEST 1234 5698 7654 32",
      prompt: "Customer jane.doe@example.com card 4111 1111 1111 1111 ...",
      completion: "Refund approved",
      headers: { authorization: "Bearer secret" },
    },
    { allow: ["tenantId", "latencyMs", "cached", "outcome", "note", "headers"], pseudonymise: ["userId"], key: "test-only-key", maxLength: 20 },
  );
  assert.deepEqual(record, {
    event: "rag.answer",
    userId: createHmac("sha256", "test-only-key").update("u-ana").digest("hex").slice(0, 16),
    tenantId: "northbank",
    latencyMs: 1180,
    cached: false,
    outcome: "answer from [EMAIL] ",
    note: "card [NUMBER] to [IB",
    droppedFields: "completion,headers,prompt",
  });
  const serialised = JSON.stringify(record);
  assert.doesNotMatch(serialised, /jane\.doe|4111|Bearer|u-ana/);
  assert.equal(pseudonymise("u-ana", "test-only-key"), record.userId);
  assert.notEqual(pseudonymise("u-ana", "another-key"), record.userId);
  assert.throws(() => pseudonymise("u-ana", ""), /secret key/);
  assert.equal(maskFreeText("Card 5555-5555-5555-4444, IBAN GB82 WEST 1234 5698 7654 32, mail a@b.example"), "Card [NUMBER], IBAN [IBAN], mail [EMAIL]");
});
