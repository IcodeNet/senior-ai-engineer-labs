import { test } from "vitest";
import assert from "node:assert/strict";
import { FAQS } from "./corpus.ts";
import { STANDARD, buildIndex } from "./inverted.ts";
import { bm25, explain, idf, termWeight } from "./index.ts";

const close = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message ?? ""} expected ${expected}, got ${actual}`);

// The hand-worked example in the lesson: N = 3, average length 3.
const worked = buildIndex(
  [
    { id: "d1", text: "card refund" },
    { id: "d2", text: "refund refund delay" },
    { id: "d3", text: "card freeze app now" },
  ],
  STANDARD,
);

test("idf: ln(1 + (N − df + 0.5) / (df + 0.5))", () => {
  close(idf(3, 2), Math.log(1.6));
  close(idf(3, 2), 0.470004, "rounded");
  assert.ok(idf(3, 3) > 0, "a term in every document still has a small positive idf");
  assert.ok(idf(1000, 1) > idf(1000, 100), "rarer terms weigh more");
  assert.throws(() => idf(3, 4), /df must be between 0 and 3/);
});

test("termWeight matches the hand-worked values", () => {
  const i = Math.log(1.6);
  close(termWeight(1, 2, 3, i), 0.544215, "d1, tf 1, length 2");
  close(termWeight(2, 3, 3, i), 0.646255, "d2, tf 2, length 3");
  close(termWeight(1, 4, 3, i), 0.413604, "d3, tf 1, length 4");
  assert.equal(termWeight(0, 3, 3, i), 0);
});

test("k1 controls saturation: with k1 = 0 the tenth mention adds nothing", () => {
  assert.equal(termWeight(10, 3, 3, 1, 0), termWeight(1, 3, 3, 1, 0));
  assert.ok(termWeight(10, 3, 3, 1) < 10 * termWeight(1, 3, 3, 1), "with k1 = 1.2 ten mentions are worth far less than ten times one");
});

test("b controls length normalisation: with b = 0 length does not matter", () => {
  assert.equal(termWeight(1, 2, 3, 1, 1.2, 0), termWeight(1, 40, 3, 1, 1.2, 0));
  assert.ok(termWeight(1, 2, 3, 1) > termWeight(1, 40, 3, 1));
});

test("bm25 reproduces the hand-worked ranking for 'card refund'", () => {
  const results = bm25(worked, "card refund", STANDARD);
  assert.deepEqual(results.map((r) => r.id), ["d1", "d2", "d3"]);
  close(results[0].score, 1.08843, "d1 matches both terms");
  close(results[1].score, 0.646255);
  close(results[2].score, 0.413604);
});

test("explain breaks a score down by term", () => {
  const parts = explain(worked, "card refund", "d1", STANDARD);
  assert.deepEqual(parts.map((p) => [p.term, p.tf, p.df]), [["card", 1, 2], ["refund", 1, 2]]);
  close(parts.reduce((s, p) => s + p.weight, 0), 1.08843);
  assert.equal(explain(worked, "card refund", "d2", STANDARD)[0].weight, 0, "d2 has no 'card'");
});

test("repeating a query word does not double its weight, and unmatched documents are not returned", () => {
  assert.deepEqual(bm25(worked, "refund refund", STANDARD), bm25(worked, "refund", STANDARD));
  assert.deepEqual(bm25(worked, "pension", STANDARD), []);
});

test("on the Northbank FAQ, a rare term decides: 'replacement' finds the lost-card answer", () => {
  const index = buildIndex(FAQS.map((f) => ({ id: f.id, text: `${f.title} ${f.text}` })), STANDARD);
  assert.equal(bm25(index, "card replacement", STANDARD, { top: 1 })[0].id, "faq-card-lost");
  assert.equal(bm25(index, "card", STANDARD, { top: 10 }).length, 2, "'cards' in the draft is a different token");
  assert.equal(bm25(index, "card", STANDARD, { top: 1 }).length, 1);
});

test("equal scores are ordered by id, so results are stable", () => {
  const twins = buildIndex([{ id: "b", text: "refund card" }, { id: "a", text: "card refund" }, { id: "c", text: "delay" }], STANDARD);
  const results = bm25(twins, "refund", STANDARD);
  assert.equal(results[0].score, results[1].score);
  assert.deepEqual(results.map((r) => r.id), ["a", "b"]);
});
