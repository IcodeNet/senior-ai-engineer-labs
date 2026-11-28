import { createHash } from "node:crypto";

export type ErrorKind = "transient" | "rate-limited" | "invalid" | "permanent";

export class ToolError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export type Sleep = (ms: number) => Promise<void>;

export interface StoredResult {
  value: unknown;
}

export interface IdempotencyStore {
  get(key: string): Promise<StoredResult | undefined>;
  set(key: string, result: StoredResult): Promise<void>;
}

export function isRetryable(error: unknown): boolean {
  return error instanceof ToolError && (error.kind === "transient" || error.kind === "rate-limited");
}

export function backoffDelay(failedAttempt: number, policy: RetryPolicy, error?: unknown): number {
  const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (failedAttempt - 1));
  if (error instanceof ToolError && error.kind === "rate-limited" && error.retryAfterMs !== undefined)
    return Math.max(exponential, error.retryAfterMs);
  return exponential;
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  sleep: Sleep,
): Promise<{ value: T; attempts: number }> {
  for (let attempt = 1; ; attempt++) {
    try {
      return { value: await operation(attempt), attempts: attempt };
    } catch (error) {
      if (!isRetryable(error) || attempt >= policy.maxAttempts) throw error;
      await sleep(backoffDelay(attempt, policy, error));
    }
  }
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function idempotencyKey(runId: string, toolName: string, args: Record<string, unknown>): string {
  const digest = createHash("sha256").update(stableStringify(args)).digest("hex").slice(0, 16);
  return `${runId}:${toolName}:${digest}`;
}

export function idempotent<T>(
  toolName: string,
  runId: string,
  store: IdempotencyStore,
  execute: (args: Record<string, unknown>, key: string) => Promise<T>,
): (args: Record<string, unknown>) => Promise<{ value: T; replayed: boolean }> {
  return async (args) => {
    const key = idempotencyKey(runId, toolName, args);
    const stored = await store.get(key);
    if (stored) return { value: stored.value as T, replayed: true };
    const value = await execute(args, key);
    await store.set(key, { value });
    return { value, replayed: false };
  };
}
