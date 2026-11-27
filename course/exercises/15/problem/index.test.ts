import { test } from "vitest";
import assert from "node:assert/strict";
import { evaluateGate, ratchetBaseline, type Rule } from "./index.ts";

const rules: Rule[] = [
  { metric: "recall@5", floor: 0.75, tolerance: 0.05 },
  { metric: "ndcg@5", tolerance: 0.03 },
  { metric: "latency_p95_ms", better: "lower", ceiling: 2500, tolerance: 200 },
  { metric: "cost_per_query_gbp", better: "lower", ceiling: 0.01 },
];
const baseline = { "recall@5": 0.82, "ndcg@5": 0.71, latency_p95_ms: 1800, cost_per_query_gbp: 0.004 };

test("a run within every limit passes", () => {
  const gate = evaluateGate(baseline, { "recall@5": 0.8, "ndcg@5": 0.7, latency_p95_ms: 1900, cost_per_query_gbp: 0.005 }, rules);
  assert.equal(gate.passed, true);
  assert.deepEqual(gate.results.map((r) => r.message), ["recall@5: ok", "ndcg@5: ok", "latency_p95_ms: ok", "cost_per_query_gbp: ok"]);
});

test("worsening exactly by the tolerance passes despite floating-point error", () => {
  const gate = evaluateGate(baseline, { "recall@5": 0.77, "ndcg@5": 0.68, latency_p95_ms: 2000, cost_per_query_gbp: 0.004 }, rules);
  assert.equal(gate.passed, true);
});

test("each failure is reported with a precise message", () => {
  const gate = evaluateGate(baseline, { "recall@5": 0.7, "ndcg@5": 0.6, latency_p95_ms: 2100, cost_per_query_gbp: 0.0125 }, rules);
  assert.equal(gate.passed, false);
  assert.deepEqual(gate.results, [
    { metric: "recall@5", status: "fail", message: "recall@5: 0.7 is below the floor 0.75" },
    { metric: "ndcg@5", status: "fail", message: "ndcg@5: fell from 0.71 to 0.6 (tolerance 0.03)" },
    { metric: "latency_p95_ms", status: "fail", message: "latency_p95_ms: rose from 1800 to 2100 (tolerance 200)" },
    { metric: "cost_per_query_gbp", status: "fail", message: "cost_per_query_gbp: 0.0125 is above the ceiling 0.01" },
  ]);
});

test("missing metrics fail and limits apply without a baseline", () => {
  const gate = evaluateGate({}, { "recall@5": 0.9, latency_p95_ms: 3000 }, rules);
  assert.deepEqual(gate.results.map((r) => r.status), ["pass", "missing", "fail", "missing"]);
  assert.equal(gate.results[1].message, "ndcg@5: missing from the current run");
  assert.equal(gate.results[2].message, "latency_p95_ms: 3000 is above the ceiling 2500");
});

test("the baseline only ratchets from a passing run", () => {
  const current = { "recall@5": 0.85, "ndcg@5": 0.74, latency_p95_ms: 1700, cost_per_query_gbp: 0.003, extra: 1 };
  const gate = evaluateGate(baseline, current, rules);
  const next = ratchetBaseline(baseline, current, gate, rules);
  assert.deepEqual(next, { "recall@5": 0.85, "ndcg@5": 0.74, latency_p95_ms: 1700, cost_per_query_gbp: 0.003 });
  assert.equal(baseline["recall@5"], 0.82, "the original baseline is not mutated");
  const failing = evaluateGate(baseline, { ...current, "recall@5": 0.5 }, rules);
  assert.throws(() => ratchetBaseline(baseline, current, failing, rules), { message: "cannot update the baseline from a failing run" });
});
