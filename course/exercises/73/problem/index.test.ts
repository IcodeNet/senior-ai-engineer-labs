import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  ToolError,
  backoffDelay,
  idempotencyKey,
  idempotent,
  isRetryable,
  stableStringify,
  withRetry,
  type IdempotencyStore,
  type StoredResult,
} from "./index.ts";

const policy = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 1000 };

function recordingSleep(): { sleep: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return { delays, sleep: async (ms) => void delays.push(ms) };
}

function memoryStore(): IdempotencyStore & { data: Map<string, StoredResult> } {
  const data = new Map<string, StoredResult>();
  return { data, get: async (key) => data.get(key), set: async (key, value) => void data.set(key, value) };
}

test("only transient and rate-limited tool errors are retryable", () => {
  assert.equal(isRetryable(new ToolError("timeout", "transient")), true);
  assert.equal(isRetryable(new ToolError("slow down", "rate-limited", 2000)), true);
  assert.equal(isRetryable(new ToolError("amount must be positive", "invalid")), false);
  assert.equal(isRetryable(new ToolError("account closed", "permanent")), false);
  assert.equal(isRetryable(new Error("TypeError in tool code")), false, "do not retry what you do not understand");
  assert.equal(isRetryable("boom"), false);
});

test("backoff doubles from the base delay, is capped, and honours Retry-After", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map((n) => backoffDelay(n, policy)), [100, 200, 400, 800, 1000]);
  assert.equal(backoffDelay(1, policy, new ToolError("slow down", "rate-limited", 3000)), 3000);
  assert.equal(backoffDelay(4, policy, new ToolError("slow down", "rate-limited", 50)), 800);
  assert.equal(backoffDelay(1, policy, new ToolError("timeout", "transient", 3000)), 100, "Retry-After applies to rate limits only");
});

test("transient failures are retried with backoff until the call succeeds", async () => {
  const { sleep, delays } = recordingSleep();
  const seen: number[] = [];
  const result = await withRetry(
    async (attempt) => {
      seen.push(attempt);
      if (attempt < 3) throw new ToolError("gateway timeout", "transient");
      return "rate=0.86";
    },
    policy,
    sleep,
  );
  assert.deepEqual(result, { value: "rate=0.86", attempts: 3 });
  assert.deepEqual(seen, [1, 2, 3]);
  assert.deepEqual(delays, [100, 200]);
});

test("non-retryable errors fail immediately; exhausted retries rethrow the last error", async () => {
  const { sleep, delays } = recordingSleep();
  let attempts = 0;
  const invalid = new ToolError("currency not supported", "invalid");
  await assert.rejects(
    withRetry(async () => {
      attempts++;
      throw invalid;
    }, policy, sleep),
    (error) => error === invalid,
  );
  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);

  let n = 0;
  await assert.rejects(
    withRetry(async () => {
      n++;
      throw new ToolError(`timeout ${n}`, "transient");
    }, policy, sleep),
    { message: "timeout 4" },
  );
  assert.equal(n, 4);
  assert.deepEqual(delays, [100, 200, 400]);
});

test("stable stringify ignores key order at every level and drops undefined", () => {
  assert.equal(stableStringify({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: "s" } }), '{"a":{"c":"s","d":[2,{"x":0,"y":1}]},"b":1}');
  assert.equal(stableStringify({ a: 1, b: undefined }), stableStringify({ a: 1 }));
  assert.equal(stableStringify([3, "x", null, true]), '[3,"x",null,true]');
});

test("idempotency keys are stable for equal arguments and differ by run, tool and value", () => {
  const args = { claimId: "clm-7", amount: 120, currency: "GBP" };
  const digest = createHash("sha256").update('{"amount":120,"claimId":"clm-7","currency":"GBP"}').digest("hex").slice(0, 16);
  assert.equal(idempotencyKey("run-1", "issue_refund", args), `run-1:issue_refund:${digest}`);
  assert.equal(idempotencyKey("run-1", "issue_refund", { currency: "GBP", amount: 120, claimId: "clm-7" }), idempotencyKey("run-1", "issue_refund", args));
  assert.notEqual(idempotencyKey("run-2", "issue_refund", args), idempotencyKey("run-1", "issue_refund", args));
  assert.notEqual(idempotencyKey("run-1", "issue_refund", { ...args, amount: 121 }), idempotencyKey("run-1", "issue_refund", args));
});

test("a repeated call with the same arguments replays the stored result without executing", async () => {
  const store = memoryStore();
  const keys: string[] = [];
  const refund = idempotent("issue_refund", "run-1", store, async (args, key) => {
    keys.push(key);
    return { refundId: `rf-${keys.length}`, amount: args.amount };
  });
  assert.deepEqual(await refund({ claimId: "clm-7", amount: 120 }), { value: { refundId: "rf-1", amount: 120 }, replayed: false });
  assert.deepEqual(await refund({ amount: 120, claimId: "clm-7" }), { value: { refundId: "rf-1", amount: 120 }, replayed: true });
  assert.deepEqual(keys, [idempotencyKey("run-1", "issue_refund", { claimId: "clm-7", amount: 120 })]);
  assert.equal((await refund({ claimId: "clm-8", amount: 120 })).replayed, false);
});

test("failures are not stored, so a later attempt can still succeed", async () => {
  const store = memoryStore();
  let calls = 0;
  const refund = idempotent("issue_refund", "run-1", store, async () => {
    calls++;
    if (calls === 1) throw new ToolError("timeout", "transient");
    return "ok";
  });
  await assert.rejects(refund({ claimId: "clm-7" }), { message: "timeout" });
  assert.equal(store.data.size, 0);
  assert.deepEqual(await refund({ claimId: "clm-7" }), { value: "ok", replayed: false });
});

test("retry plus an idempotency key: a timeout after the payment committed does not pay twice", async () => {
  // Fake payments API: commits the refund, then the response is lost on the first attempt.
  const ledger = new Map<string, number>();
  let requests = 0;
  const paymentsApi = async (key: string, amount: number): Promise<string> => {
    requests++;
    if (!ledger.has(key)) ledger.set(key, amount);
    if (requests === 1) throw new ToolError("response timed out", "transient");
    return `refund committed under ${key}`;
  };
  const { sleep } = recordingSleep();
  const refund = idempotent("issue_refund", "run-9", memoryStore(), (args, key) =>
    withRetry(() => paymentsApi(key, Number(args.amount)), policy, sleep).then((r) => r.value),
  );
  const result = await refund({ claimId: "clm-7", amount: 120 });
  assert.equal(result.replayed, false);
  assert.equal(requests, 2);
  assert.equal(ledger.size, 1, "one refund despite two requests");
  assert.deepEqual([...ledger.values()], [120]);
});
