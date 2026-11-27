import { test } from "vitest";
import assert from "node:assert/strict";
import { percentileNearestRank, requestCost, summarise, type PriceTable } from "./index.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
// Placeholder prices per million tokens for the exercise; not real pricing.
const prices: PriceTable = { "model-small": { input: 0.5, output: 1.5 }, "model-large": { input: 5, output: 15 } };

test("cost uses separate input and output rates per million tokens", () => {
  close(requestCost({ model: "model-small", inputTokens: 4000, outputTokens: 500, latencyMs: 900 }, prices), 0.002 + 0.00075);
  close(requestCost({ model: "model-large", inputTokens: 1_000_000, outputTokens: 0, latencyMs: 1 }, prices), 5);
});

test("unknown models and invalid token counts are rejected", () => {
  assert.throws(() => requestCost({ model: "mystery", inputTokens: 1, outputTokens: 1, latencyMs: 1 }, prices), {
    message: "no price for model mystery",
  });
  assert.throws(() => requestCost({ model: "model-small", inputTokens: -1, outputTokens: 1, latencyMs: 1 }, prices), RangeError);
  assert.throws(() => requestCost({ model: "model-small", inputTokens: 1.5, outputTokens: 1, latencyMs: 1 }, prices), RangeError);
});

test("nearest-rank percentiles", () => {
  const latencies = [900, 100, 500, 300, 700, 200, 800, 400, 600, 1000];
  assert.equal(percentileNearestRank(latencies, 50), 500);
  assert.equal(percentileNearestRank(latencies, 95), 1000);
  assert.equal(percentileNearestRank(latencies, 90), 900);
  assert.equal(percentileNearestRank(latencies, 0), 100);
  assert.equal(percentileNearestRank([42], 99), 42);
  assert.throws(() => percentileNearestRank([], 50), RangeError);
  assert.throws(() => percentileNearestRank([1], 101), RangeError);
});

test("a summary projects monthly cost and checks the budget", () => {
  const records = Array.from({ length: 20 }, (_, i) => ({
    model: "model-small",
    inputTokens: 2000,
    outputTokens: 200,
    latencyMs: (i + 1) * 100,
  }));
  const summary = summarise(records, prices, { monthlyQueries: 100_000, monthlyBudget: 150 });
  close(summary.costPerQuery, 0.001 + 0.0003);
  close(summary.totalCost, 20 * 0.0013);
  close(summary.projectedMonthlyCost, 130);
  assert.equal(summary.queries, 20);
  assert.equal(summary.p50Ms, 1000);
  assert.equal(summary.p95Ms, 1900);
  assert.equal(summary.withinBudget, true);
  assert.equal(summarise(records, prices, { monthlyQueries: 200_000, monthlyBudget: 150 }).withinBudget, false);
  assert.throws(() => summarise([], prices, { monthlyQueries: 1, monthlyBudget: 1 }), RangeError);
});
