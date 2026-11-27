import { test } from "vitest";
import assert from "node:assert/strict";
import {
  backoffDelay,
  CircuitBreaker,
  CircuitOpenError,
  HttpError,
  isRetryable,
  retry,
  TimeoutError,
  withFallback,
  withTimeout,
} from "./index.ts";

const never = <T>(): Promise<T> => new Promise<T>(() => {});

test("withTimeout returns fast results and rejects slow ones with TimeoutError, aborting the call", async () => {
  assert.equal(await withTimeout(async () => "ok", 50), "ok");
  let seen: AbortSignal | undefined;
  await assert.rejects(
    withTimeout((signal) => {
      seen = signal;
      return never<string>();
    }, 10),
    TimeoutError,
  );
  assert.equal(seen?.aborted, true);
});

test("only timeouts, throttling and server errors are retryable", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(isRetryable(new HttpError(status)), true, String(status));
  for (const status of [400, 401, 403, 404, 422]) assert.equal(isRetryable(new HttpError(status)), false, String(status));
  assert.equal(isRetryable(new TimeoutError(10)), true);
  assert.equal(isRetryable(new Error("bug")), false);
});

test("full-jitter backoff grows exponentially and is capped", () => {
  const options = { baseMs: 100, maxMs: 1000, random: () => 0.5 };
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((attempt) => backoffDelay(attempt, options)), [50, 100, 200, 400, 500, 500]);
  assert.equal(backoffDelay(3, { ...options, random: () => 0.999 }), 799);
  assert.equal(backoffDelay(3, { ...options, random: () => 0 }), 0);
});

test("retry backs off on transient errors, then succeeds", async () => {
  const sleeps: number[] = [];
  const outcomes = [new HttpError(429), new HttpError(503)];
  const result = await retry(
    async (attempt) => {
      if (attempt < outcomes.length) throw outcomes[attempt];
      return `answer on attempt ${attempt}`;
    },
    { retries: 3, baseMs: 100, maxMs: 1000, random: () => 0.5, sleep: async (ms) => void sleeps.push(ms) },
  );
  assert.equal(result, "answer on attempt 2");
  assert.deepEqual(sleeps, [50, 100]);
});

test("retry gives up after the limit and never retries permanent errors", async () => {
  const options = { retries: 2, baseMs: 10, maxMs: 100, random: () => 1, sleep: async () => {} };
  let calls = 0;
  await assert.rejects(retry(async () => { calls++; throw new HttpError(503); }, options), (e: unknown) => e instanceof HttpError && e.status === 503);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(retry(async () => { calls++; throw new HttpError(400); }, options), HttpError);
  assert.equal(calls, 1);
});

test("the circuit opens after consecutive failures, fails fast, then half-opens after the cooldown", async () => {
  let clock = 0;
  const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 30_000, now: () => clock });
  let calls = 0;
  const failing = async () => { calls++; throw new HttpError(503); };
  assert.equal(breaker.state(), "closed");
  for (let i = 0; i < 3; i++) await assert.rejects(breaker.call(failing), HttpError);
  assert.equal(breaker.state(), "open");
  await assert.rejects(breaker.call(failing), CircuitOpenError);
  assert.equal(calls, 3, "an open circuit must not call the dependency");

  clock = 30_000;
  assert.equal(breaker.state(), "half-open");
  await assert.rejects(breaker.call(failing), HttpError);
  assert.equal(breaker.state(), "open", "a failed trial re-opens immediately");

  clock = 60_000;
  assert.equal(await breaker.call(async () => "recovered"), "recovered");
  assert.equal(breaker.state(), "closed");
});

test("a success resets the failure count", async () => {
  const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, now: () => 0 });
  await assert.rejects(breaker.call(async () => { throw new HttpError(500); }));
  await breaker.call(async () => "ok");
  await assert.rejects(breaker.call(async () => { throw new HttpError(500); }));
  assert.equal(breaker.state(), "closed");
});

test("fallbacks degrade gracefully and say so", async () => {
  assert.deepEqual(await withFallback(async () => "model answer", () => "unused"), { value: "model answer", degraded: false });
  const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, now: () => 0 });
  await assert.rejects(breaker.call(async () => { throw new HttpError(503); }));
  const result = await withFallback(
    () => breaker.call(async () => "model answer"),
    () => "The assistant is busy. Here are the top policy documents instead.",
  );
  assert.deepEqual(result, { value: "The assistant is busy. Here are the top policy documents instead.", degraded: true, error: "CircuitOpenError" });
});
