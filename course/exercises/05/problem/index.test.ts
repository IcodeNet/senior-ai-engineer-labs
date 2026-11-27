import { test } from "vitest";
import assert from "node:assert/strict";
import { hybridSearch, reciprocalRankFusion } from "./index.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("scores are the sum of 1 / (k + rank) with 1-based ranks", () => {
  const results = reciprocalRankFusion([["a", "b"], ["b", "c"]]);
  const score = Object.fromEntries(results.map((r) => [r.id, r.score]));
  close(score.a, 1 / 61);
  close(score.b, 1 / 62 + 1 / 61);
  close(score.c, 1 / 62);
  assert.deepEqual(results.map((r) => r.id), ["b", "a", "c"]);
});

test("consistent agreement beats a single first place", () => {
  const results = reciprocalRankFusion([
    ["lexical-only", "both", "x"],
    ["vector-only", "both", "y"],
  ]);
  assert.equal(results[0].id, "both");
});

test("k controls how much top ranks dominate", () => {
  const rankings = [["a", "b", "c", "d"], ["d", "c", "b", "a"], ["a", "x", "y", "z"]];
  assert.equal(reciprocalRankFusion(rankings, { k: 1 })[0].id, "a");
  const flat = reciprocalRankFusion(rankings, { k: 1000 });
  assert.ok(flat[0].score - flat[1].score < 0.001);
});

test("duplicates within one ranking count once, at their best position", () => {
  const results = reciprocalRankFusion([["a", "b", "a"]]);
  close(results.find((r) => r.id === "a")!.score, 1 / 61);
});

test("results are capped and ties break by id", () => {
  const results = reciprocalRankFusion([["d", "c"], ["c", "d"], ["e", "f", "g", "h", "i"]], { top: 3 });
  assert.deepEqual(results.map((r) => r.id), ["c", "d", "e"]);
  assert.deepEqual(reciprocalRankFusion([]), []);
});

test("hybrid search fuses lexical and vector results by order, ignoring raw scores", () => {
  const lexical = [{ id: "err-4021", score: 9.7 }, { id: "network", score: 2.1 }];
  const vector = [{ id: "network", score: 0.91 }, { id: "err-4021", score: 0.42 }, { id: "retry", score: 0.4 }];
  const results = hybridSearch(lexical, vector);
  assert.deepEqual(results.map((r) => r.id), ["err-4021", "network", "retry"]);
  close(results[0].score, 1 / 61 + 1 / 62);
});
