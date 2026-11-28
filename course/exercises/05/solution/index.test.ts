import { test } from "vitest";
import assert from "node:assert/strict";
import { FAQS } from "./corpus.ts";
import { eligible, estimateTokens, overlapRetrieve, packContext, retrieveForPrompt } from "./index.ts";

const TODAY = "2026-11-28";
const faq = (id: string) => FAQS.find((f) => f.id === id)!;

test("estimateTokens is a four-characters-per-token planning estimate, rounded up", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("abcde"), 2);
});

test("only approved answers in force today are eligible", () => {
  assert.equal(eligible(faq("faq-card-lost"), TODAY), true);
  assert.equal(eligible(faq("faq-fx-fee-draft"), TODAY), false, "drafts never reach the model");
  assert.equal(eligible(faq("faq-cheque-retired"), TODAY), false, "retired answers never reach the model");
  assert.equal(eligible(faq("faq-overdraft-fee-2027"), TODAY), false, "not in force yet");
  assert.equal(eligible(faq("faq-overdraft-fee"), "2027-01-02"), false, "expired");
  assert.equal(eligible(faq("faq-overdraft-fee"), "2026-12-31"), true, "the expiry date itself is still in force");
  assert.equal(eligible(faq("faq-refund-time"), "2026-03-01"), true, "the effective date itself is in force");
});

test("overlapRetrieve counts distinct query words, highest first, ties by id", () => {
  const hits = overlapRetrieve("how long does a card refund take", FAQS, 3);
  assert.equal(hits[0].id, "faq-refund-time");
  assert.ok(hits.every((h, i) => i === 0 || h.score <= hits[i - 1].score));
  assert.deepEqual(overlapRetrieve("overdraft overdraft", FAQS, 5).map((h) => h.id), ["faq-overdraft-fee", "faq-overdraft-fee-2027"]);
});

test("a naive word match misses paraphrases: 'money back' finds no refund answer", () => {
  assert.deepEqual(overlapRetrieve("when do I get my money back", FAQS, 5).filter((h) => h.id === "faq-refund-time"), []);
});

test("packContext fills the budget in rank order and skips passages that do not fit", () => {
  const ranked = [
    { id: "a", text: "x".repeat(40) }, // 10 tokens
    { id: "b", text: "x".repeat(80) }, // 20 tokens: does not fit after a
    { id: "c", text: "x".repeat(20) }, // 5 tokens
  ];
  assert.deepEqual(packContext(ranked, 16), { ids: ["a", "c"], tokens: 15 });
  assert.deepEqual(packContext(ranked, 9), { ids: ["c"], tokens: 5 });
  assert.deepEqual(packContext([], 100), { ids: [], tokens: 0 });
});

test("the whole corpus does not fit a small budget, so something has to choose", () => {
  const all = FAQS.map((f) => ({ id: f.id, text: f.text }));
  assert.ok(packContext(all, 60).ids.length < FAQS.length);
});

test("retrieveForPrompt filters before retrieving, so a draft can never be selected", () => {
  const packed = retrieveForPrompt("foreign transaction fee debit cards", FAQS, TODAY, 5, 500);
  assert.ok(!packed.ids.includes("faq-fx-fee-draft"));
  const overdraft = retrieveForPrompt("overdraft fees", FAQS, TODAY, 1, 500);
  assert.deepEqual(overdraft.ids, ["faq-overdraft-fee"], "only the answer in force today can take the slot");
});
