import { test } from "vitest";
import assert from "node:assert/strict";
import { breakEvenQueries, compareArchitectures, monthlyCost, type Architecture, type PriceTable } from "./index.ts";

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

// Placeholder prices per million tokens; not real pricing.
const prices: PriceTable = {
  base: { input: 2, output: 8, cachedInput: 0.5 },
  tuned: { input: 3, output: 12 },
};

const rag: Architecture = {
  kind: "rag",
  name: "rag",
  model: "base",
  promptTokens: 500,
  retrievedTokens: 2000,
  outputTokens: 300,
  retrievalCostPerQuery: 0.0001,
  fixedMonthly: 250,
};
const fineTune: Architecture = {
  kind: "fine-tune",
  name: "fine-tune",
  model: "tuned",
  promptTokens: 500,
  outputTokens: 300,
  trainingCost: 6000,
  amortisationMonths: 6,
  hostingPerMonth: 1200,
};
const longContext: Architecture = {
  kind: "long-context",
  name: "long-context",
  model: "base",
  promptTokens: 500,
  contextTokens: 100_000,
  outputTokens: 300,
  cachedFraction: 0.9,
};

test("each architecture has its own variable and fixed cost", () => {
  const r = monthlyCost(rag, 100_000, prices);
  close(r.variablePerQuery, 0.0075);
  close(r.fixedMonthly, 250);
  close(r.totalMonthly, 1000);
  close(r.perQuery, 0.01);

  const f = monthlyCost(fineTune, 100_000, prices);
  close(f.variablePerQuery, 0.0051);
  close(f.fixedMonthly, 2200); // 6000 / 6 + 1200
  close(f.totalMonthly, 2710);

  const l = monthlyCost(longContext, 100_000, prices);
  close(l.variablePerQuery, 0.021 + 0.045 + 0.0024); // uncached input + cached input + output
  close(l.fixedMonthly, 0);
  close(l.totalMonthly, 6840);
});

test("the cheapest architecture depends on volume", () => {
  assert.deepEqual(compareArchitectures([longContext, fineTune, rag], 100_000, prices).map(c => c.name), ["rag", "fine-tune", "long-context"]);
  assert.deepEqual(compareArchitectures([longContext, fineTune, rag], 1_000_000, prices).map(c => c.name), ["fine-tune", "rag", "long-context"]);
  assert.deepEqual(compareArchitectures([longContext, rag], 1000, prices).map(c => c.name), ["long-context", "rag"]);
});

test("break-even volume is where fixed plus variable costs cross", () => {
  close(breakEvenQueries(rag, fineTune, prices) ?? NaN, 812_500); // 1950 / 0.0024
  close(breakEvenQueries(fineTune, rag, prices) ?? NaN, 812_500);
  close(breakEvenQueries(longContext, rag, prices) ?? NaN, 250 / (0.0684 - 0.0075));
});

test("no break-even when the slopes are equal or one option dominates", () => {
  assert.equal(breakEvenQueries(rag, { ...rag, name: "rag-cheaper-search", fixedMonthly: 100 }, prices), null);
  assert.equal(breakEvenQueries(rag, { ...rag, name: "rag-lean", retrievedTokens: 1000, fixedMonthly: 100 }, prices), null);
});

test("missing prices and invalid inputs are rejected", () => {
  assert.throws(() => monthlyCost({ ...rag, model: "mystery" }, 1, prices), { message: "no price for model mystery" });
  assert.throws(() => monthlyCost({ ...longContext, model: "tuned" }, 1, prices), { message: "no cached-input price for model tuned" });
  assert.throws(() => monthlyCost({ ...longContext, cachedFraction: 1.5 }, 1, prices), RangeError);
  assert.throws(() => monthlyCost({ ...fineTune, amortisationMonths: 0 }, 1, prices), RangeError);
  assert.throws(() => monthlyCost(rag, -1, prices), RangeError);
});
