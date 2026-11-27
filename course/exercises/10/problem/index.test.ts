import { test } from "vitest";
import assert from "node:assert/strict";
import { compareK, evaluateRetriever, type EvalCase, type Retriever } from "./index.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

const cases: EvalCase[] = [
  { id: "q-travel", query: "travel", relevant: { t1: 3, t2: 1 } },
  { id: "q-gifts", query: "gifts", relevant: { g1: 3 } },
  { id: "q-hotel", query: "hotel", relevant: { h1: 2 } },
];
const rankings: Record<string, string[]> = {
  travel: ["t1", "x", "t2", "y", "z", "w"],
  gifts: ["x", "y", "z", "w", "v", "g1"],
  hotel: ["h1", "x", "y", "z", "w", "v"],
};
function fakeRetriever() {
  const calls: string[] = [];
  const retriever: Retriever = async (query) => {
    calls.push(query);
    return rankings[query];
  };
  return { retriever, calls };
}

test("each case is scored on its top K and the means are macro averages", async () => {
  const { retriever, calls } = fakeRetriever();
  const report = await evaluateRetriever(cases, retriever, 5);
  assert.deepEqual(calls, ["travel", "gifts", "hotel"]);
  const travel = report.cases[0];
  assert.deepEqual(travel.retrieved, ["t1", "x", "t2", "y", "z"]);
  close(travel.precision, 2 / 5);
  close(travel.recall, 1);
  close(travel.mrr, 1);
  assert.deepEqual(travel.missed, []);
  const gifts = report.cases[1];
  assert.equal(gifts.recall, 0);
  assert.equal(gifts.mrr, 0, "reciprocal rank only looks inside the top K");
  assert.deepEqual(gifts.missed, ["g1"]);
  close(report.mean.recall, (1 + 0 + 1) / 3);
  close(report.mean.precision, (2 / 5 + 0 + 1 / 5) / 3);
  assert.equal(report.k, 5);
});

test("worst cases are the lowest recall, ties broken by id", async () => {
  const { retriever } = fakeRetriever();
  const report = await evaluateRetriever(cases, retriever, 5);
  assert.deepEqual(report.worst, ["q-gifts", "q-hotel", "q-travel"]);
});

test("a retrieval error fails the run and names the case", async () => {
  const failing: Retriever = async (query) => {
    if (query === "gifts") throw new Error("search timed out");
    return rankings[query];
  };
  await assert.rejects(evaluateRetriever(cases, failing), { message: "retrieval failed for q-gifts: search timed out" });
});

test("comparing K values retrieves once per case", async () => {
  const { retriever, calls } = fakeRetriever();
  const comparison = await compareK(cases, retriever, [5, 10]);
  assert.equal(calls.length, 3);
  close(comparison[5].recall, 2 / 3);
  close(comparison[10].recall, 1);
  assert.ok(comparison[10].precision < comparison[5].precision, "precision falls as K grows");
});
