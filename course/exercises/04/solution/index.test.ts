import { test } from "vitest";
import assert from "node:assert/strict";
import { embed } from "./embedding.ts";
import { cosineSimilarity, vectorSearch } from "./index.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("cosine similarity measures direction, not magnitude", () => {
  close(cosineSimilarity([1, 0], [1, 0]), 1);
  close(cosineSimilarity([1, 0], [0, 1]), 0);
  close(cosineSimilarity([1, 0], [-1, 0]), -1);
  close(cosineSimilarity([1, 2, 3], [2, 4, 6]), 1);
  close(cosineSimilarity([3, 4], [4, 3]), 24 / 25);
});

test("zero vectors and mismatched dimensions are handled", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]), RangeError);
});

test("results are ranked, positive and capped", () => {
  const items = [
    { id: "b", vector: [1, 1] },
    { id: "a", vector: [1, 1] },
    { id: "best", vector: [1, 0] },
    { id: "opposite", vector: [-1, 0] },
    { id: "orthogonal", vector: [0, 1] },
  ];
  const results = vectorSearch([1, 0], items, 3);
  assert.deepEqual(results.map((r) => r.id), ["best", "a", "b"]);
  assert.ok(vectorSearch([1, 0], items, 10).every((r) => r.score > 0));
});

test("vector search finds a semantic match that shares no keywords with the query", () => {
  const chunks = [
    { id: "membership", text: "Terminating a subscription stops future billing." },
    { id: "travel", text: "Book economy for flights under six hours." },
    { id: "gifts", text: "Register gifts above fifty pounds." },
  ];
  const items = chunks.map((chunk) => ({ id: chunk.id, vector: embed(chunk.text) }));
  const [first] = vectorSearch(embed("How do I cancel my membership?"), items);
  assert.equal(first.id, "membership");
});
