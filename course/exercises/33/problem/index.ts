export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`timed out after ${ms} ms`);
    this.name = "TimeoutError";
  }
}

export class CircuitOpenError extends Error {
  constructor() {
    super("circuit open");
    this.name = "CircuitOpenError";
  }
}

/** An HTTP-style failure from a model or search dependency. */
export class HttpError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "HttpError";
  }
}

export interface RetryOptions {
  retries: number;
  baseMs: number;
  maxMs: number;
  random: () => number;
  sleep: (ms: number) => Promise<void>;
  isRetryable?: (error: unknown) => boolean;
}

export type CircuitState = "closed" | "open" | "half-open";

export async function withTimeout<T>(op: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  // TODO: race op(signal) against a timer that aborts and rejects with TimeoutError; always clear the timer.
  throw new Error("Not implemented: withTimeout");
}

const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryable(error: unknown): boolean {
  // TODO: TimeoutError, or HttpError with 408, 429, 500, 502, 503 or 504.
  throw new Error("Not implemented: isRetryable");
}

export function backoffDelay(attempt: number, options: { baseMs: number; maxMs: number; random: () => number }): number {
  // TODO: full jitter: floor(random() * min(maxMs, baseMs * 2 ** attempt)).
  throw new Error("Not implemented: backoffDelay");
}

export async function retry<T>(op: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  // TODO: call op(attempt); on a retryable error sleep backoffDelay(attempt) and try again, up to retries extra attempts.
  throw new Error("Not implemented: retry");
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | undefined;

  constructor(
    private readonly options: {
      failureThreshold: number;
      cooldownMs: number;
      now: () => number;
      /** Which errors say the dependency is unhealthy. Default isRetryable: caller errors (4xx) do not count. */
      isFailure?: (error: unknown) => boolean;
    },
  ) {}

  state(): CircuitState {
    // TODO: closed with no open time; half-open once cooldownMs has passed since opening; otherwise open.
    throw new Error("Not implemented: CircuitBreaker.state");
  }

  async call<T>(op: () => Promise<T>): Promise<T> {
    // TODO: fail fast when open; success or a non-failure error (isFailure, default isRetryable) resets and closes;
    // a failure counts, and opens at the threshold or after a failed half-open trial.
    throw new Error("Not implemented: CircuitBreaker.call");
  }
}

export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: (error: unknown) => T | Promise<T>,
): Promise<{ value: T; degraded: boolean; error?: string }> {
  // TODO: return the primary value, or the fallback value with degraded: true and the error name.
  throw new Error("Not implemented: withFallback");
}
