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
  // TODO: only transient and rate-limited ToolErrors are worth retrying.
  throw new Error("Not implemented: isRetryable");
}

export function backoffDelay(failedAttempt: number, policy: RetryPolicy, error?: unknown): number {
  // TODO: capped exponential backoff, honouring Retry-After for rate limits.
  throw new Error("Not implemented: backoffDelay");
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  sleep: Sleep,
): Promise<{ value: T; attempts: number }> {
  // TODO: retry retryable failures up to maxAttempts, sleeping between attempts; rethrow everything else.
  throw new Error("Not implemented: withRetry");
}

export function stableStringify(value: unknown): string {
  // TODO: JSON with object keys sorted at every level, so equal arguments give equal strings.
  throw new Error("Not implemented: stableStringify");
}

export function idempotencyKey(runId: string, toolName: string, args: Record<string, unknown>): string {
  // TODO: "<runId>:<toolName>:<first 16 hex chars of sha256(stableStringify(args))>".
  throw new Error("Not implemented: idempotencyKey");
}

export function idempotent<T>(
  toolName: string,
  runId: string,
  store: IdempotencyStore,
  execute: (args: Record<string, unknown>, key: string) => Promise<T>,
): (args: Record<string, unknown>) => Promise<{ value: T; replayed: boolean }> {
  // TODO: replay a stored result for the same key; otherwise execute with the key and store only successes.
  throw new Error("Not implemented: idempotent");
}
