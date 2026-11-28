import { test } from "vitest";
import assert from "node:assert/strict";
import {
  assignVariant,
  bucketOf,
  nextCanaryPercent,
  rolloutDecision,
  shadowAgreement,
  type ReleaseMetrics,
  type RolloutPolicy,
} from "./index.ts";

const baseline: ReleaseMetrics = { requests: 20_000, errors: 100, p95Ms: 2000, groundedness: 0.92, judgedSamples: 2000, costPerQuery: 0.004, safetyViolations: 0 };
const policy: RolloutPolicy = { minRequests: 500, minJudgedSamples: 200, maxErrorRateIncrease: 0.01, maxLatencyIncrease: 0.2, maxCostIncrease: 0.25, maxGroundednessDrop: 0.02 };
const healthy: ReleaseMetrics = { requests: 1000, errors: 6, p95Ms: 2100, groundedness: 0.91, judgedSamples: 300, costPerQuery: 0.0045, safetyViolations: 0 };

test("buckets come from FNV-1a and are stable", () => {
  assert.equal(bucketOf(""), 61);
  assert.equal(bucketOf("a"), 20);
  assert.equal(bucketOf("release:u-ana"), bucketOf("release:u-ana"));
});

test("canary assignment is sticky per user and close to the requested share", () => {
  assert.equal(assignVariant("u-ana", 100, "release"), "canary");
  assert.equal(assignVariant("u-ana", 0, "release"), "baseline");
  assert.equal(assignVariant("u-ana", 61, "release"), "canary", "bucket of 'release:u-ana' is 60, inside a 61% canary");
  assert.equal(assignVariant("u-ana", 60, "release"), "baseline");
  assert.throws(() => assignVariant("u-ana", 5, ""));
  const users = Array.from({ length: 10_000 }, (_, i) => `user-${i}`);
  const share = (percent: number) => users.filter((u) => assignVariant(u, percent, "rel-42") === "canary").length / users.length;
  assert.ok(Math.abs(share(5) - 0.05) < 0.01);
  assert.ok(Math.abs(share(25) - 0.25) < 0.01);
  const atFive = users.filter((u) => assignVariant(u, 5, "rel-42") === "canary");
  assert.ok(atFive.every((u) => assignVariant(u, 25, "rel-42") === "canary"), "users in the canary stay in it as the share grows");
  assert.throws(() => assignVariant("u-ana", 101, "rel-42"), RangeError);
});

test("each release picks a different canary slice, so the same users are not always the guinea pigs", () => {
  const users = Array.from({ length: 10_000 }, (_, i) => `user-${i}`);
  const slice = (release: string) => new Set(users.filter((u) => assignVariant(u, 5, release) === "canary"));
  const a = slice("rel-42");
  const b = slice("rel-43");
  const shared = [...a].filter((u) => b.has(u)).length;
  assert.ok(shared / a.size < 0.2, `only about 5% should overlap by chance, got ${shared} of ${a.size}`);
});

test("shadow evaluation compares abstentions and citation sets, not wording", () => {
  const report = shadowAgreement([
    { requestId: "r1", baseline: { kind: "answer", citations: ["travel", "expenses"] }, candidate: { kind: "answer", citations: ["expenses", "travel", "travel"] } },
    { requestId: "r2", baseline: { kind: "abstain", citations: [] }, candidate: { kind: "abstain", citations: [] } },
    { requestId: "r3", baseline: { kind: "answer", citations: ["fx-cutoff"] }, candidate: { kind: "abstain", citations: [] } },
    { requestId: "r4", baseline: { kind: "answer", citations: ["fx-cutoff"] }, candidate: { kind: "answer", citations: ["fx-cutoff-2019"] } },
  ]);
  assert.deepEqual(report, {
    agreement: 0.5,
    disagreements: [
      { requestId: "r3", kind: "abstain-mismatch" },
      { requestId: "r4", kind: "citation-mismatch" },
    ],
  });
  assert.throws(() => shadowAgreement([]), RangeError);
});

test("a healthy canary with enough traffic is promoted", () => {
  assert.deepEqual(rolloutDecision(baseline, healthy, policy), { action: "promote", reasons: [] });
});

test("too little traffic holds; a single safety violation rolls back regardless", () => {
  assert.deepEqual(rolloutDecision(baseline, { ...healthy, requests: 120 }, policy), { action: "hold", reasons: ["insufficient-traffic"] });
  assert.deepEqual(rolloutDecision(baseline, { ...healthy, requests: 120, safetyViolations: 1 }, policy), { action: "rollback", reasons: ["safety-violations"] });
  assert.deepEqual(rolloutDecision(baseline, { ...healthy, judgedSamples: 40 }, policy), { action: "hold", reasons: ["insufficient-judged-samples"] }, "groundedness from 40 judged answers is noise");
  assert.deepEqual(rolloutDecision(baseline, { ...healthy, requests: 120, judgedSamples: 40 }, policy), { action: "hold", reasons: ["insufficient-traffic", "insufficient-judged-samples"] });
});

test("every breached guardrail is reported in the rollback", () => {
  const bad: ReleaseMetrics = { requests: 1000, errors: 25, p95Ms: 2600, groundedness: 0.85, judgedSamples: 300, costPerQuery: 0.0055, safetyViolations: 0 };
  assert.deepEqual(rolloutDecision(baseline, bad, policy), { action: "rollback", reasons: ["error-rate", "latency", "groundedness", "cost"] });
  assert.deepEqual(rolloutDecision(baseline, { ...healthy, p95Ms: 2500 }, policy), { action: "rollback", reasons: ["latency"] });
  assert.deepEqual(rolloutDecision(baseline, { ...healthy, p95Ms: 2350 }, policy), { action: "promote", reasons: [] });
});

test("the rollout advances one stage on promote, stays on hold, and returns to 0 on rollback", () => {
  assert.equal(nextCanaryPercent(1, "promote"), 5);
  assert.equal(nextCanaryPercent(50, "promote"), 100);
  assert.equal(nextCanaryPercent(100, "promote"), 100);
  assert.equal(nextCanaryPercent(25, "hold"), 25);
  assert.equal(nextCanaryPercent(25, "rollback"), 0);
  assert.throws(() => nextCanaryPercent(10, "promote"), RangeError);
});
