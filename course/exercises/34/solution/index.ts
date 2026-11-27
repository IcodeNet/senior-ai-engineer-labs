export interface TakeResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export type Reservation =
  | { ok: true; id: string; maxOutputTokens: number }
  | { ok: false; reason: "budget-exceeded"; remaining: number };

/** A rough planning estimate: about four characters per token for English text. Bill on the provider's counts. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(private readonly options: { capacity: number; refillPerSecond: number; now: () => number }) {}

  take(key: string, cost = 1): TakeResult {
    const { capacity, refillPerSecond, now } = this.options;
    if (cost <= 0 || cost > capacity) throw new RangeError(`cost must be between 1 and ${capacity}`);
    const time = now();
    const bucket = this.buckets.get(key) ?? { tokens: capacity, updatedAt: time };
    bucket.tokens = Math.min(capacity, bucket.tokens + ((time - bucket.updatedAt) / 1000) * refillPerSecond);
    bucket.updatedAt = time;
    this.buckets.set(key, bucket);
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterMs: 0 };
    }
    const retryAfterMs = Math.ceil(((cost - bucket.tokens) / refillPerSecond) * 1000);
    return { allowed: false, remaining: Math.floor(bucket.tokens), retryAfterMs };
  }
}

export class TokenBudget {
  private readonly used = new Map<string, number>();
  private readonly open = new Map<string, { account: string; tokens: number }>();
  private sequence = 0;

  constructor(private readonly options: { dailyLimit: number; now: () => Date }) {}

  private account(userId: string): string {
    return `${userId}|${this.options.now().toISOString().slice(0, 10)}`;
  }

  remaining(userId: string): number {
    const account = this.account(userId);
    let reserved = 0;
    for (const reservation of this.open.values()) if (reservation.account === account) reserved += reservation.tokens;
    return Math.max(0, this.options.dailyLimit - (this.used.get(account) ?? 0) - reserved);
  }

  reserve(userId: string, inputTokens: number, requestedOutputTokens: number): Reservation {
    const remaining = this.remaining(userId);
    const maxOutputTokens = Math.min(requestedOutputTokens, remaining - inputTokens);
    if (maxOutputTokens < 1) return { ok: false, reason: "budget-exceeded", remaining };
    this.sequence += 1;
    const id = `${userId}#${this.sequence}`;
    this.open.set(id, { account: this.account(userId), tokens: inputTokens + maxOutputTokens });
    return { ok: true, id, maxOutputTokens };
  }

  settle(id: string, actualTokens: number): void {
    const reservation = this.open.get(id);
    if (!reservation) throw new Error(`unknown or already settled reservation ${id}`);
    this.open.delete(id);
    this.used.set(reservation.account, (this.used.get(reservation.account) ?? 0) + actualTokens);
  }
}
