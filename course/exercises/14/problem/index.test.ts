import { test } from "vitest";
import assert from "node:assert/strict";
import { bootstrapMeanCI, compareSystems, mulberry32, pairedDifferences, percentile } from "./index.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("paired differences are candidate minus baseline", () => {
  assert.deepEqual(pairedDifferences([0.5, 1, 0], [1, 1, 0.5]), [0.5, 0, 0.5]);
  assert.throws(() => pairedDifferences([], []), RangeError);
  assert.throws(() => pairedDifferences([1], [1, 2]), RangeError);
});

test("percentiles interpolate linearly", () => {
  const sorted = [10, 20, 30, 40, 50];
  assert.equal(percentile(sorted, 0), 10);
  assert.equal(percentile(sorted, 1), 50);
  assert.equal(percentile(sorted, 0.5), 30);
  close(percentile(sorted, 0.1), 14);
  close(percentile([1, 2], 0.25), 1.25);
});

test("the bootstrap is reproducible for a seed and brackets the sample mean", () => {
  const values = Array.from({ length: 40 }, (_, i) => ((i * 7) % 11) / 10 - 0.3);
  const a = bootstrapMeanCI(values, { seed: 7 });
  const b = bootstrapMeanCI(values, { seed: 7 });
  assert.deepEqual(a, b);
  assert.ok(a.low < a.mean && a.mean < a.high);
  const wider = bootstrapMeanCI(values, { seed: 7, confidence: 0.99 });
  assert.ok(wider.low <= a.low && wider.high >= a.high, "higher confidence gives a wider interval");
  const constant = bootstrapMeanCI([0.2, 0.2, 0.2]);
  close(constant.low, 0.2);
  close(constant.high, 0.2);
});

test("resampling uses the provided seeded generator", () => {
  const random = mulberry32(42);
  const values = [1, 2, 3];
  const firstResampleMean = values.map(() => values[Math.floor(random() * values.length)]).reduce((s, v) => s + v, 0) / values.length;
  const single = bootstrapMeanCI(values, { iterations: 1, seed: 42 });
  close(single.low, firstResampleMean);
  close(single.high, firstResampleMean);
});

test("decisions follow the confidence interval", () => {
  const baseline = Array.from({ length: 60 }, (_, i) => (i % 5) / 5);
  const better = baseline.map((v) => Math.min(1, v + 0.2));
  assert.equal(compareSystems(baseline, better).decision, "improved");
  assert.equal(compareSystems(better, baseline).decision, "regressed");
  const noisy = baseline.map((v, i) => (i % 2 === 0 ? Math.min(1, v + 0.2) : Math.max(0, v - 0.2)));
  assert.equal(compareSystems(baseline, noisy).decision, "inconclusive");
  const result = compareSystems([0.5, 0.5], [0.7, 0.7]);
  close(result.meanDifference, 0.2);
});
