import { test } from "vitest";
import assert from "node:assert/strict";
import { JUDGE_RULES, buildJudgePrompt, comparePairwise, judgeAnswer, parseVerdict, type Llm } from "./index.ts";

const input = { question: "Can I fly business?", answer: "Only on flights over six hours [S1].", sources: ["Economy class is required for flights under six hours."] };
function scripted(replies: string[]) {
  const prompts: { system: string; user: string }[] = [];
  const llm: Llm = async (prompt) => {
    prompts.push(prompt);
    return replies[Math.min(prompts.length - 1, replies.length - 1)];
  };
  return { llm, prompts };
}

test("the judge prompt keeps the rubric apart from the judged content", () => {
  const prompt = buildJudgePrompt(input);
  assert.equal(prompt.system, JUDGE_RULES);
  assert.equal(
    prompt.user,
    "Question: Can I fly business?\nAnswer: Only on flights over six hours [S1].\nSources:\n[S1] Economy class is required for flights under six hours.",
  );
});

test("valid verdicts parse, with or without a json fence", () => {
  assert.deepEqual(parseVerdict('{"score": 4, "reason": " Mostly correct. "}'), { ok: true, score: 4, reason: "Mostly correct." });
  assert.deepEqual(parseVerdict('```json\n{"score": 5, "reason": "Correct."}\n```'), { ok: true, score: 5, reason: "Correct." });
});

test("malformed verdicts are rejected, never defaulted", () => {
  assert.deepEqual(parseVerdict("Score: 5"), { ok: false, error: "not-json" });
  assert.deepEqual(parseVerdict("[5]"), { ok: false, error: "not-json" });
  assert.deepEqual(parseVerdict('{"score": 7, "reason": "x"}'), { ok: false, error: "invalid-score" });
  assert.deepEqual(parseVerdict('{"score": "5", "reason": "x"}'), { ok: false, error: "invalid-score" });
  assert.deepEqual(parseVerdict('{"score": 4.5, "reason": "x"}'), { ok: false, error: "invalid-score" });
  assert.deepEqual(parseVerdict('{"score": 3, "reason": "  "}'), { ok: false, error: "missing-reason" });
});

test("invalid output is retried a bounded number of times", async () => {
  const recovering = scripted(["I think it's good", '{"score": 3, "reason": "Partly supported."}']);
  assert.deepEqual(await judgeAnswer(input, recovering.llm), { ok: true, score: 3, reason: "Partly supported.", attempts: 2 });
  const broken = scripted(["nope"]);
  assert.deepEqual(await judgeAnswer(input, broken.llm, 2), { ok: false, error: "not-json", attempts: 3 });
  assert.equal(broken.prompts.length, 3);
  const first = scripted(['{"score": 5, "reason": "Correct."}']);
  assert.equal((await judgeAnswer(input, first.llm)).attempts, 1);
});

test("pairwise comparison swaps the order and requires agreement", async () => {
  const fair: Llm = async ({ user }) => (user.match(/Answer A:\n(.*)/)?.[1] === "good" ? "A" : "B");
  assert.equal(await comparePairwise("q", "good", "bad", fair), "first");
  assert.equal(await comparePairwise("q", "bad", "good", fair), "second");
  const biased: Llm = async () => "A";
  assert.equal(await comparePairwise("q", "good", "bad", biased), "inconsistent");
  assert.equal(await comparePairwise("q", "x", "y", async () => " tie "), "tie");
  assert.equal(await comparePairwise("q", "x", "y", async () => "Answer A is better"), "invalid");
});
