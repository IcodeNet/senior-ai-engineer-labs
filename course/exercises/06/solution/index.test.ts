import { test } from "vitest";
import assert from "node:assert/strict";
import { FAQS } from "./corpus.ts";
import { ENGLISH_STOP, STANDARD, analyze, buildIndex, matchAll, matchAny, tokenize } from "./index.ts";

test("tokenize splits on punctuation but keeps apostrophes in words and decimals in numbers", () => {
  assert.deepEqual(tokenize("Error ERR-4021: retry, then escalate!"), ["Error", "ERR", "4021", "retry", "then", "escalate"]);
  assert.deepEqual(tokenize("Northbank's overdraft is 39.9% EAR"), ["Northbank's", "overdraft", "is", "39.9", "EAR"]);
  assert.deepEqual(tokenize("1,000 cards, 2 days"), ["1,000", "cards", "2", "days"]);
  assert.deepEqual(tokenize("Café crème"), ["Café", "crème"], "letters are Unicode letters, not just a-z");
  assert.deepEqual(tokenize("  ...  "), []);
});

test("the standard analyzer lower-cases and, by default, removes no stopwords", () => {
  assert.deepEqual(analyze("The Card", STANDARD), [
    { term: "the", position: 0 },
    { term: "card", position: 1 },
  ]);
});

test("removing stopwords keeps the original positions, leaving gaps", () => {
  assert.deepEqual(analyze("Freeze the card in the app", ENGLISH_STOP), [
    { term: "freeze", position: 0 },
    { term: "card", position: 2 },
    { term: "app", position: 5 },
  ]);
});

test("buildIndex records term frequency, positions and document length", () => {
  const index = buildIndex(
    [
      { id: "b", text: "Refund refund card" },
      { id: "a", text: "Card freeze" },
    ],
    STANDARD,
  );
  assert.equal(index.docCount, 2);
  assert.deepEqual(index.docLength, { a: 2, b: 3 });
  assert.deepEqual(index.postings.refund, [{ id: "b", tf: 2, positions: [0, 1] }]);
  assert.deepEqual(index.postings.card, [
    { id: "a", tf: 1, positions: [0] },
    { id: "b", tf: 1, positions: [2] },
  ], "postings are sorted by document id");
  assert.equal(index.postings.Refund, undefined, "terms are stored after analysis");
});

test("document length counts indexed tokens, so stopwords do not count", () => {
  const index = buildIndex([{ id: "a", text: "the card and the app" }], ENGLISH_STOP);
  assert.equal(index.docLength.a, 2);
});

test("duplicate document ids are rejected", () => {
  assert.throws(() => buildIndex([{ id: "a", text: "x" }, { id: "a", text: "y" }], STANDARD), /duplicate document id: a/);
});

test("matchAny is a union and matchAll an intersection of postings", () => {
  const index = buildIndex(FAQS, STANDARD);
  assert.deepEqual(matchAny(index, "replacement refund", STANDARD), ["faq-card-lost", "faq-refund-time"]);
  assert.deepEqual(matchAll(index, "replacement refund", STANDARD), []);
  assert.deepEqual(matchAll(index, "Replacement CARD", STANDARD), ["faq-card-lost"], "the query goes through the same analyzer");
  assert.deepEqual(matchAll(index, "", STANDARD), []);
});

test("exact tokens: an inverted index has no idea that 'refunds' and 'refund' are related", () => {
  const index = buildIndex(FAQS, STANDARD);
  assert.deepEqual(matchAny(index, "refunds", STANDARD), []);
  assert.deepEqual(matchAny(index, "refund", STANDARD), ["faq-refund-time"]);
});

test("an analyzer can keep case, and stopwords still match whatever their case", () => {
  const keepCase = { lowercase: false, stopwords: ["THE"] };
  assert.deepEqual(analyze("The Card the card", keepCase), [
    { term: "Card", position: 1 },
    { term: "card", position: 3 },
  ]);
  const index = buildIndex([{ id: "a", text: "Card" }], keepCase);
  assert.deepEqual(matchAny(index, "card", keepCase), [], "without lower-casing, 'card' and 'Card' are different terms");
  assert.deepEqual(matchAny(index, "Card", keepCase), ["a"]);
});
