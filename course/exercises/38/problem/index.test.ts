import { test } from "vitest";
import assert from "node:assert/strict";
import { estimateCapacity, tokensPerRequest, type DeploymentLimits, type RequestProfile } from "./index.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// Synthetic RAG assistant: 5 chunks of 300 tokens per answer. Limits are placeholders, not a real quota.
const profile: RequestProfile = {
  systemPromptTokens: 400,
  queryTokens: 50,
  retrievedChunks: 5,
  tokensPerChunk: 300,
  outputTokens: 350,
  meanLatencyMs: 2500,
};
const limits: DeploymentLimits = { tokensPerMinute: 1_000_000, requestsPerMinute: 6_000, targetUtilisation: 0.8 };

test("tokens per request add the system prompt, query and every retrieved chunk", () => {
  assert.deepEqual(tokensPerRequest(profile), { input: 1950, output: 350, total: 2300 });
  assert.throws(() => tokensPerRequest({ ...profile, retrievedChunks: -1 }), RangeError);
  assert.throws(() => tokensPerRequest({ ...profile, outputTokens: 10.5 }), RangeError);
});

test("capacity is sized for the peak, not the daily average, with headroom", () => {
  const plan = estimateCapacity(profile, { dailyRequests: 864_000, peakToAverage: 3 }, limits);
  close(plan.averageRps, 10);
  close(plan.peakRps, 30);
  close(plan.peakRequestsPerMinute, 1800);
  close(plan.peakTokensPerMinute, 4_140_000);
  assert.equal(plan.inputTokensPerRequest, 1950);
  assert.equal(plan.outputTokensPerRequest, 350);
  assert.equal(plan.deploymentsNeeded, 6); // 4.14M / (1M x 0.8) = 5.175
  assert.equal(plan.bindingConstraint, "tokens");
  assert.equal(plan.concurrentRequests, 75); // Little's law: 30 rps x 2.5 s
});

test("retrieving more chunks scales token demand and deployments", () => {
  const plan = estimateCapacity({ ...profile, retrievedChunks: 10 }, { dailyRequests: 864_000, peakToAverage: 3 }, limits);
  close(plan.peakTokensPerMinute, 6_840_000);
  assert.equal(plan.deploymentsNeeded, 9);
});

test("short requests can be bound by the request limit instead", () => {
  const tiny: RequestProfile = { systemPromptTokens: 0, queryTokens: 50, retrievedChunks: 0, tokensPerChunk: 0, outputTokens: 50, meanLatencyMs: 200 };
  const plan = estimateCapacity(tiny, { dailyRequests: 864_000, peakToAverage: 3 }, { tokensPerMinute: 1_000_000, requestsPerMinute: 600, targetUtilisation: 1 });
  assert.equal(plan.bindingConstraint, "requests");
  assert.equal(plan.deploymentsNeeded, 3);
  assert.equal(plan.concurrentRequests, 6);
});

test("at least one deployment, and invalid inputs are rejected", () => {
  assert.equal(estimateCapacity(profile, { dailyRequests: 0, peakToAverage: 1 }, limits).deploymentsNeeded, 1);
  assert.throws(() => estimateCapacity(profile, { dailyRequests: 1000, peakToAverage: 0.5 }, limits), RangeError);
  assert.throws(() => estimateCapacity(profile, { dailyRequests: 1000, peakToAverage: 2 }, { ...limits, targetUtilisation: 0 }), RangeError);
  assert.throws(() => estimateCapacity(profile, { dailyRequests: 1000, peakToAverage: 2 }, { ...limits, targetUtilisation: 1.2 }), RangeError);
  assert.throws(() => estimateCapacity(profile, { dailyRequests: 1000, peakToAverage: 2 }, { ...limits, tokensPerMinute: 0 }), RangeError);
});
