import { test } from "vitest";
import assert from "node:assert/strict";
import { burnRate, evaluateSlo, shouldPage, type RequestEvent } from "./index.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// 1000 synthetic requests: 10 failures, 10 slow answers, and a quality sample of every tenth request.
function events(): RequestEvent[] {
  return Array.from({ length: 1000 }, (_, i) => {
    const event: RequestEvent = { ok: i % 100 !== 0, latencyMs: i % 50 === 0 ? 3000 : 800 };
    if (i % 10 === 5) event.quality = i % 100 === 5 ? "fail" : "pass";
    return event;
  });
}

test("availability counts every request and spends the error budget on failures", () => {
  const report = evaluateSlo(events(), { name: "availability", kind: "availability", target: 0.995 });
  assert.equal(report.total, 1000);
  assert.equal(report.good, 990);
  assert.equal(report.bad, 10);
  close(report.compliance ?? NaN, 0.99);
  close(report.allowedBad, 5);
  close(report.budgetRemaining, -1);
  assert.equal(report.status, "breached");
});

test("latency counts only served requests", () => {
  const report = evaluateSlo(events(), { name: "p-latency", kind: "latency", target: 0.98, thresholdMs: 2000 });
  assert.equal(report.total, 990);
  assert.equal(report.bad, 10);
  close(report.allowedBad, 19.8);
  close(report.budgetRemaining, 1 - 10 / 19.8);
  assert.equal(report.status, "ok");
});

test("quality SLOs use only evaluated requests and need enough samples", () => {
  const slo = { name: "groundedness", kind: "quality" as const, target: 0.85, minSamples: 50 };
  const report = evaluateSlo(events(), slo);
  assert.equal(report.total, 100);
  assert.equal(report.good, 90);
  close(report.allowedBad, 15);
  close(report.budgetRemaining, 1 / 3);
  assert.equal(report.status, "ok");
  assert.equal(evaluateSlo(events(), slo, 0.5).status, "at-risk");
  assert.equal(evaluateSlo(events(), { ...slo, minSamples: 200 }).status, "insufficient-data");
});

test("no traffic is insufficient data, and targets must leave a budget", () => {
  const report = evaluateSlo([], { name: "availability", kind: "availability", target: 0.99 });
  assert.equal(report.status, "insufficient-data");
  assert.equal(report.compliance, null);
  assert.throws(() => evaluateSlo(events(), { name: "perfect", kind: "availability", target: 1 }), RangeError);
  assert.throws(() => evaluateSlo(events(), { name: "zero", kind: "availability", target: 0 }), RangeError);
});

test("burn rate compares the bad fraction with the budgeted fraction", () => {
  close(burnRate({ bad: 10, total: 1000 }, 0.995), 2);
  close(burnRate({ bad: 20, total: 100 }, 0.99), 20);
  assert.equal(burnRate({ bad: 0, total: 0 }, 0.99), 0);
});

test("page only when both the short and the long window burn fast", () => {
  assert.equal(shouldPage({ short: { bad: 20, total: 100 }, long: { bad: 50, total: 1000 } }, 0.99), false);
  assert.equal(shouldPage({ short: { bad: 20, total: 100 }, long: { bad: 150, total: 1000 } }, 0.99), true);
  assert.equal(shouldPage({ short: { bad: 1, total: 100 }, long: { bad: 150, total: 1000 } }, 0.99), false);
  assert.equal(shouldPage({ short: { bad: 20, total: 100 }, long: { bad: 50, total: 1000 } }, 0.99, 4), true);
});
