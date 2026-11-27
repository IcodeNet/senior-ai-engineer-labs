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
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(ms));
    }, ms);
  });
  try {
    return await Promise.race([op(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryable(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  return error instanceof HttpError && TRANSIENT.has(error.status);
}

export function backoffDelay(attempt: number, options: { baseMs: number; maxMs: number; random: () => number }): number {
  const ceiling = Math.min(options.maxMs, options.baseMs * 2 ** attempt);
  return Math.floor(options.random() * ceiling);
}

export async function retry<T>(op: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const retryable = options.isRetryable ?? isRetryable;
  for (let attempt = 0; ; attempt++) {
    try {
      return await op(attempt);
    } catch (error) {
      if (attempt >= options.retries || !retryable(error)) throw error;
      await options.sleep(backoffDelay(attempt, options));
    }
  }
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | undefined;

  constructor(private readonly options: { failureThreshold: number; cooldownMs: number; now: () => number }) {}

  state(): CircuitState {
    if (this.openedAt === undefined) return "closed";
    return this.options.now() - this.openedAt >= this.options.cooldownMs ? "half-open" : "open";
  }

  async call<T>(op: () => Promise<T>): Promise<T> {
    const state = this.state();
    if (state === "open") throw new CircuitOpenError();
    try {
      const value = await op();
      this.failures = 0;
      this.openedAt = undefined;
      return value;
    } catch (error) {
      this.failures += 1;
      if (state === "half-open" || this.failures >= this.options.failureThreshold) this.openedAt = this.options.now();
      throw error;
    }
  }
}

export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: (error: unknown) => T | Promise<T>,
): Promise<{ value: T; degraded: boolean; error?: string }> {
  try {
    return { value: await primary(), degraded: false };
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    return { value: await fallback(error), degraded: true, error: name };
  }
}
