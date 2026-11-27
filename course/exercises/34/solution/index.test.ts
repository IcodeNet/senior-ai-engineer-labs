import { test } from "vitest";
import assert from "node:assert/strict";
import { estimateTokens, TokenBucket, TokenBudget } from "./index.ts";

test("token estimates round up at about four characters per token", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("What is the FX settlement cut-off?"), 9);
});

test("a token bucket allows a burst, then refills at a steady rate", () => {
  let clock = 0;
  const limiter = new TokenBucket({ capacity: 3, refillPerSecond: 1, now: () => clock });
  assert.deepEqual([1, 2, 3].map(() => limiter.take("u-ana").allowed), [true, true, true]);
  assert.deepEqual(limiter.take("u-ana"), { allowed: false, remaining: 0, retryAfterMs: 1000 });
  clock = 500;
  assert.deepEqual(limiter.take("u-ana"), { allowed: false, remaining: 0, retryAfterMs: 500 });
  clock = 1000;
  assert.deepEqual(limiter.take("u-ana"), { allowed: true, remaining: 0, retryAfterMs: 0 });
  clock = 60_000;
  assert.deepEqual(limiter.take("u-ana"), { allowed: true, remaining: 2, retryAfterMs: 0 }, "refill is capped at capacity");
});

test("each user has their own bucket and expensive requests cost more", () => {
  const limiter = new TokenBucket({ capacity: 10, refillPerSecond: 2, now: () => 0 });
  assert.equal(limiter.take("u-ana", 8).allowed, true);
  assert.deepEqual(limiter.take("u-ana", 4), { allowed: false, remaining: 2, retryAfterMs: 1000 });
  assert.equal(limiter.take("u-ben", 10).allowed, true);
  assert.throws(() => limiter.take("u-ana", 11), RangeError);
  assert.throws(() => limiter.take("u-ana", 0), RangeError);
});

test("reservations cap max output tokens to what is left of the daily budget", () => {
  const budget = new TokenBudget({ dailyLimit: 1000, now: () => new Date("2026-11-27T09:00:00Z") });
  assert.deepEqual(budget.reserve("u-ana", 300, 500), { ok: true, id: "u-ana#1", maxOutputTokens: 500 });
  assert.equal(budget.remaining("u-ana"), 200);
  assert.deepEqual(budget.reserve("u-ana", 150, 500), { ok: true, id: "u-ana#2", maxOutputTokens: 50 });
  assert.deepEqual(budget.reserve("u-ana", 10, 10), { ok: false, reason: "budget-exceeded", remaining: 0 });
  assert.equal(budget.remaining("u-ben"), 1000);
});

test("settling records actual usage and refunds the unused reservation", () => {
  const budget = new TokenBudget({ dailyLimit: 1000, now: () => new Date("2026-11-27T09:00:00Z") });
  const first = budget.reserve("u-ana", 300, 500);
  const second = budget.reserve("u-ana", 100, 100);
  assert.ok(first.ok && second.ok);
  budget.settle(first.id, 420);
  assert.equal(budget.remaining("u-ana"), 1000 - 420 - 200);
  assert.throws(() => budget.settle(first.id, 420), /already settled/);
  assert.throws(() => budget.settle("nope", 1), /unknown/);
  budget.settle(second.id, 150);
  assert.equal(budget.remaining("u-ana"), 430);
});

test("budgets reset at the start of the next UTC day", () => {
  let now = new Date("2026-11-27T23:59:00Z");
  const budget = new TokenBudget({ dailyLimit: 100, now: () => now });
  const reservation = budget.reserve("u-ana", 60, 40);
  assert.ok(reservation.ok);
  budget.settle(reservation.id, 100);
  assert.equal(budget.reserve("u-ana", 1, 1).ok, false);
  now = new Date("2026-11-28T00:00:00Z");
  assert.equal(budget.remaining("u-ana"), 100);
});
