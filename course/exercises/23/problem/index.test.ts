import { test } from "vitest";
import assert from "node:assert/strict";
import { runAgent, type Message, type Model, type ModelTurn, type Tool } from "./index.ts";

function scripted(turns: ModelTurn[]): { model: Model; requests: Message[][] } {
  const requests: Message[][] = [];
  const model: Model = async ({ messages }) => {
    requests.push(messages);
    const turn = turns[requests.length - 1];
    if (!turn) throw new Error("model called more often than scripted");
    return turn;
  };
  return { model, requests };
}

function fxTool(): Tool & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    name: "convert_currency",
    description: "Convert an amount between currencies at today's reference rate.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Amount to convert", minimum: 0 },
        from: { type: "string", description: "Source currency", enum: ["GBP", "EUR", "USD"] },
        to: { type: "string", description: "Target currency", enum: ["GBP", "EUR", "USD"] },
      },
      required: ["amount", "from", "to"],
      additionalProperties: false,
    },
    async run(args) {
      calls.push(args);
      return { amount: Number(args.amount) * 0.8, currency: args.to };
    },
  };
}

function assertEveryCallAnswered(messages: Message[]): void {
  const answered = new Set(messages.flatMap((m) => (m.role === "tool" ? [m.toolCallId] : [])));
  for (const m of messages) if (m.role === "assistant") for (const c of m.toolCalls ?? []) assert.ok(answered.has(c.id), `call ${c.id} has no result`);
}

const call = (id: string, args: unknown, name = "convert_currency") => ({ id, name, arguments: JSON.stringify(args) });
const options = (model: Model, tools: Tool[], extra = {}) => ({ model, tools, system: "You are an expenses assistant.", ...extra });

test("a final answer on the first turn ends the run without tool calls", async () => {
  const { model, requests } = scripted([{ type: "final", text: "Meals are capped at 40 GBP." }]);
  const result = await runAgent("What is the meal cap?", options(model, [fxTool()]));
  assert.equal(result.stopReason, "final");
  assert.equal(result.text, "Meals are capped at 40 GBP.");
  assert.equal(result.steps, 1);
  assert.equal(result.toolCalls, 0);
  assert.deepEqual(requests[0], [
    { role: "system", content: "You are an expenses assistant." },
    { role: "user", content: "What is the meal cap?" },
  ]);
});

test("tool results are appended with the call ID and the model sees them on the next turn", async () => {
  const fx = fxTool();
  const { model, requests } = scripted([
    { type: "tool_calls", calls: [call("c1", { amount: 50, from: "USD", to: "GBP" })] },
    { type: "final", text: "50 USD is 40 GBP." },
  ]);
  const result = await runAgent("How much is 50 USD in GBP?", options(model, [fx]));
  assert.equal(result.stopReason, "final");
  assert.deepEqual(fx.calls, [{ amount: 50, from: "USD", to: "GBP" }]);
  assert.deepEqual(result.messages.slice(2), [
    { role: "assistant", content: "", toolCalls: [call("c1", { amount: 50, from: "USD", to: "GBP" })] },
    { role: "tool", toolCallId: "c1", name: "convert_currency", content: '{"amount":40,"currency":"GBP"}', isError: false },
    { role: "assistant", content: "50 USD is 40 GBP." },
  ]);
  assert.equal(requests[1].length, 4, "second request includes the assistant turn and the tool result");
  assert.equal(result.steps, 2);
  assert.equal(result.toolCalls, 1);
});

test("the model receives tool definitions only, never the implementation", async () => {
  let seenTools: unknown[] = [];
  const model: Model = async ({ tools }) => {
    seenTools = tools;
    return { type: "final", text: "ok" };
  };
  await runAgent("hi", options(model, [fxTool()]));
  assert.equal(seenTools.length, 1);
  assert.deepEqual(Object.keys(seenTools[0] as object).sort(), ["description", "inputSchema", "name"]);
});

test("unknown tools and invalid arguments are fed back as errors and nothing runs", async () => {
  const fx = fxTool();
  const { model } = scripted([
    { type: "tool_calls", calls: [call("c1", { to: "GBP" }, "transfer_funds"), call("c2", { amount: 50, from: "JPY", to: "GBP" })] },
    { type: "tool_calls", calls: [call("c3", { amount: 50, from: "USD", to: "GBP" })] },
    { type: "final", text: "40 GBP." },
  ]);
  const result = await runAgent("Convert 50 dollars", options(model, [fx]));
  assert.equal(result.stopReason, "final");
  assert.deepEqual(fx.calls, [{ amount: 50, from: "USD", to: "GBP" }]);
  const toolMessages = result.messages.filter((m) => m.role === "tool");
  assert.deepEqual(toolMessages.slice(0, 2), [
    { role: "tool", toolCallId: "c1", name: "transfer_funds", content: 'Unknown tool "transfer_funds". Available tools: convert_currency', isError: true },
    { role: "tool", toolCallId: "c2", name: "convert_currency", content: "Invalid arguments: $.from: must be one of: GBP, EUR, USD", isError: true },
  ]);
});

test("a tool that throws becomes an error result and the loop continues", async () => {
  const flaky: Tool = { ...fxTool(), run: async () => Promise.reject(new Error("rates service unavailable")) };
  const { model } = scripted([
    { type: "tool_calls", calls: [call("c1", { amount: 1, from: "EUR", to: "GBP" })] },
    { type: "final", text: "I could not get a rate right now." },
  ]);
  const result = await runAgent("Convert 1 EUR", options(model, [flaky]));
  assert.equal(result.stopReason, "final");
  assert.deepEqual(result.messages[3], { role: "tool", toolCallId: "c1", name: "convert_currency", content: "Tool error: rates service unavailable", isError: true });
});

test("the step limit stops a model that never answers, without an extra model call", async () => {
  const turns: ModelTurn[] = [1, 2, 3, 4].map((n) => ({ type: "tool_calls", calls: [call(`c${n}`, { amount: n, from: "EUR", to: "GBP" })] }));
  const { model, requests } = scripted(turns);
  const result = await runAgent("Convert forever", options(model, [fxTool()], { maxSteps: 3 }));
  assert.equal(result.stopReason, "max-steps");
  assert.equal(result.text, undefined);
  assert.equal(requests.length, 3);
  assert.equal(result.steps, 3);
  assert.equal(result.toolCalls, 3);
  assertEveryCallAnswered(result.messages);
});

test("the tool-call budget caps fan-out within and across turns", async () => {
  const fx = fxTool();
  const { model } = scripted([
    { type: "tool_calls", calls: [1, 2].map((n) => call(`a${n}`, { amount: n, from: "EUR", to: "GBP" })) },
    { type: "tool_calls", calls: [3, 4].map((n) => call(`b${n}`, { amount: n, from: "EUR", to: "GBP" })) },
  ]);
  const result = await runAgent("Convert many", options(model, [fx], { maxToolCalls: 3 }));
  assert.equal(result.stopReason, "max-tool-calls");
  assert.equal(fx.calls.length, 3);
  assert.equal(result.toolCalls, 3);
  assert.deepEqual(result.messages.at(-1), { role: "tool", toolCallId: "b4", name: "convert_currency", content: "Not executed: tool-call budget exhausted", isError: true });
  assertEveryCallAnswered(result.messages);
});

test("an identical repeated call stops the run instead of looping", async () => {
  const fx = fxTool();
  const same = { amount: 5, from: "EUR", to: "GBP" };
  const { model } = scripted([
    { type: "tool_calls", calls: [call("c1", same)] },
    { type: "tool_calls", calls: [call("c2", same)] },
  ]);
  const result = await runAgent("Convert 5 EUR", options(model, [fx]));
  assert.equal(result.stopReason, "repeated-call");
  assert.equal(fx.calls.length, 1);
  assert.deepEqual(result.messages.at(-1), { role: "tool", toolCallId: "c2", name: "convert_currency", content: "Not executed: repeated call", isError: true });
  assertEveryCallAnswered(result.messages);
});

test("a tool that returns nothing produces the content null, not undefined", async () => {
  const silent: Tool = { ...fxTool(), run: async () => undefined };
  const { model } = scripted([{ type: "tool_calls", calls: [call("c1", { amount: 1, from: "EUR", to: "GBP" })] }, { type: "final", text: "done" }]);
  const result = await runAgent("x", options(model, [silent]));
  assert.equal(result.messages[3].role === "tool" && result.messages[3].content, "null");
});

test("model failures are not swallowed", async () => {
  const model: Model = async () => Promise.reject(new Error("429 from model provider"));
  await assert.rejects(runAgent("hi", options(model, [fxTool()])), { message: "429 from model provider" });
});
