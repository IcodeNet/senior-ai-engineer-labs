import { test } from "vitest";
import assert from "node:assert/strict";
import { answerQuestion, type Candidate, type Llm, type SearchProvider } from "./index.ts";

const now = new Date("2026-11-27T12:00:00Z");
const candidate = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  title: `Policy ${id}`,
  text: `Text of ${id}.`,
  score: 0.9,
  status: "approved",
  effectiveDate: "2026-01-01",
  ...over,
});

function fakeProvider(results: Candidate[]) {
  const calls: { query: string; top: number; now: Date }[] = [];
  const provider: SearchProvider = {
    async search(query, options) {
      calls.push({ query, ...options });
      return results;
    },
  };
  return { provider, calls };
}

function fakeLlm(reply: string) {
  const prompts: { system: string; user: string }[] = [];
  const llm: Llm = async (prompt) => {
    prompts.push(prompt);
    return reply;
  };
  return { llm, prompts };
}

test("a grounded answer returns its cited sources and passes now/top to the provider", async () => {
  const { provider, calls } = fakeProvider([candidate("travel"), candidate("expenses")]);
  const { llm, prompts } = fakeLlm("Economy for short flights [S1], receipts required [S2] [S1].");
  const result = await answerQuestion("Can I fly business?", { provider, llm, now, top: 3 });
  assert.deepEqual(calls, [{ query: "Can I fly business?", top: 3, now }]);
  assert.equal(prompts.length, 1);
  assert.deepEqual(result, {
    kind: "answer",
    text: "Economy for short flights [S1], receipts required [S2] [S1].",
    citations: [
      { label: "S1", chunkId: "travel", title: "Policy travel" },
      { label: "S2", chunkId: "expenses", title: "Policy expenses" },
    ],
    dropped: [],
  });
});

test("ineligible candidates from a misbehaving provider never reach the model", async () => {
  const { provider } = fakeProvider([
    candidate("draft", { status: "draft", text: "DRAFT: business class for everyone." }),
    candidate("future", { effectiveDate: "2027-06-01", text: "FUTURE policy text." }),
    candidate("travel"),
  ]);
  const { llm, prompts } = fakeLlm("Economy only [S1].");
  const result = await answerQuestion("q", { provider, llm, now });
  assert.equal(result.kind, "answer");
  assert.deepEqual(result.dropped, ["draft", "future"]);
  assert.doesNotMatch(prompts[0].user, /DRAFT|FUTURE/);
});

test("no eligible evidence abstains without calling the model", async () => {
  const { provider } = fakeProvider([candidate("draft", { status: "draft" }), candidate("weak", { score: 0.1 })]);
  const { llm, prompts } = fakeLlm("should not be called [S1]");
  const result = await answerQuestion("q", { provider, llm, now, minScore: 0.5 });
  assert.deepEqual(result, { kind: "abstain", reason: "no-evidence", dropped: ["draft"] });
  assert.equal(prompts.length, 0);
});

test("answers that cite nothing are rejected as ungrounded", async () => {
  const { provider } = fakeProvider([candidate("travel")]);
  const { llm } = fakeLlm("You can fly business class.");
  assert.deepEqual(await answerQuestion("q", { provider, llm, now }), { kind: "abstain", reason: "ungrounded", dropped: [] });
});

test("answers that cite a source that was not supplied are rejected", async () => {
  const { provider } = fakeProvider([candidate("travel")]);
  const { llm } = fakeLlm("Economy [S1], but see [S4].");
  assert.deepEqual(await answerQuestion("q", { provider, llm, now }), {
    kind: "abstain",
    reason: "unknown-citation",
    dropped: [],
  });
});
