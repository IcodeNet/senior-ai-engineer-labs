import { test } from "vitest";
import assert from "node:assert/strict";
import { allocateBudget, budgetBreaches, endToEndMs, endToEndP95, sumOfGroupP95s, type Plan, type Trace } from "./index.ts";

// Lexical and vector retrieval run in parallel, then rerank, then generation.
const plan: Plan = [["lexical", "vector"], ["rerank"], ["generation"]];

// 20 synthetic traces; slow outliers in each stage land on different requests.
function traces(): Trace[] {
  return Array.from({ length: 20 }, (_, i) => ({
    lexical: 50 + (i === 3 ? 400 : 0),
    vector: 80 + (i === 7 ? 300 : 0),
    rerank: 100 + (i === 11 ? 200 : 0),
    generation: 900 + i * 10 + (i === 15 ? 1000 : 0),
  }));
}

test("parallel stages cost their slowest member; serial groups add up", () => {
  assert.equal(endToEndMs({ lexical: 50, vector: 80, rerank: 100, generation: 900 }, plan), 1080);
  assert.equal(endToEndMs({ lexical: 450, vector: 80, rerank: 100, generation: 900 }, plan), 1450);
  assert.throws(() => endToEndMs({ lexical: 1, vector: 1, rerank: 1 }, plan), { message: "missing stage generation" });
});

test("P95 is computed on end-to-end latency, and adding stage P95s overestimates it", () => {
  const all = traces();
  assert.equal(endToEndP95(all, plan), 1480);
  assert.equal(sumOfGroupP95s(all, plan), 1570); // 380 + 100 + 1090
  assert.ok(sumOfGroupP95s(all, plan) > endToEndP95(all, plan));
});

test("a latency budget gives every stage its floor and shares the rest by weight", () => {
  const allocation = allocateBudget(2000, [
    { name: "retrieval", weight: 1, floorMs: 100 },
    { name: "rerank", weight: 1, floorMs: 100 },
    { name: "generation", weight: 4, floorMs: 600 },
  ]);
  assert.deepEqual(allocation, { retrieval: 300, rerank: 300, generation: 1400 });
  assert.equal(Object.values(allocation).reduce((a, b) => a + b, 0), 2000);
});

test("impossible budgets are rejected", () => {
  assert.throws(() => allocateBudget(500, [{ name: "generation", weight: 1, floorMs: 600 }]), { message: "floors exceed budget" });
  assert.throws(() => allocateBudget(500, [{ name: "generation", weight: 0, floorMs: 100 }]), RangeError);
  assert.throws(() => allocateBudget(500, [{ name: "generation", weight: -1, floorMs: 100 }]), RangeError);
  assert.throws(() => allocateBudget(500, []), RangeError);
});

test("breaches list only stages over budget, worst first", () => {
  const allocation = { retrieval: 300, rerank: 300, generation: 1400 };
  assert.deepEqual(budgetBreaches(allocation, { retrieval: 380, rerank: 250, generation: 1600 }), [
    { stage: "generation", budgetMs: 1400, observedMs: 1600, overByMs: 200 },
    { stage: "retrieval", budgetMs: 300, observedMs: 380, overByMs: 80 },
  ]);
  assert.deepEqual(budgetBreaches(allocation, { retrieval: 300, rerank: 1, generation: 2 }), []);
  assert.throws(() => budgetBreaches(allocation, { retrieval: 1, rerank: 1 }), { message: "missing stage generation" });
});
