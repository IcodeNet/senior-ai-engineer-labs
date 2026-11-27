import { test } from "vitest";
import assert from "node:assert/strict";
import { meanOf, ndcgAtK, precisionAtK, recallAtK, reciprocalRank } from "./index.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const relevant = new Set(["r1", "r2", "r3"]);
const retrieved = ["x", "r1", "y", "r2", "z", "r3"];

test("precision@K divides by K, even when fewer results were returned", () => {
  close(precisionAtK(retrieved, relevant, 5), 2 / 5);
  close(precisionAtK(["r1"], relevant, 5), 1 / 5);
  close(precisionAtK(retrieved, relevant, 2), 1 / 2);
});

test("recall@K divides by the number of relevant chunks", () => {
  close(recallAtK(retrieved, relevant, 5), 2 / 3);
  close(recallAtK(retrieved, relevant, 10), 1);
  assert.throws(() => recallAtK(retrieved, new Set(), 5), RangeError);
});

test("duplicate retrieved IDs only count once", () => {
  close(precisionAtK(["r1", "r1", "r1"], relevant, 3), 1 / 3);
  close(recallAtK(["r1", "r1", "r2"], relevant, 3), 2 / 3);
});

test("reciprocal rank uses the first relevant result", () => {
  close(reciprocalRank(retrieved, relevant), 1 / 2);
  close(reciprocalRank(["r3"], relevant), 1);
  assert.equal(reciprocalRank(["x", "y"], relevant), 0);
});

test("NDCG rewards putting the most relevant result first", () => {
  const grades = new Map([["best", 3], ["good", 1]]);
  close(ndcgAtK(["best", "good", "x"], grades, 3), 1);
  const swapped = ndcgAtK(["good", "best", "x"], grades, 3);
  close(swapped, (1 + 7 / Math.log2(3)) / (7 + 1 / Math.log2(3)));
  assert.ok(swapped < 1);
  assert.equal(ndcgAtK(["x"], new Map([["x", 0]]), 3), 0);
});

test("invalid K and empty means are rejected; means average per-query scores", () => {
  for (const k of [0, -1, 1.5]) {
    assert.throws(() => precisionAtK(retrieved, relevant, k), RangeError);
    assert.throws(() => ndcgAtK(retrieved, new Map(), k), RangeError);
  }
  assert.throws(() => meanOf([]), RangeError);
  close(meanOf([1, 0.5, 0]), 0.5);
});
