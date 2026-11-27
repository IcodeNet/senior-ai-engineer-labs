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
  // TODO: ceil(length / 4).
  throw new Error("Not implemented: estimateTokens");
}

export class TokenBucket {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(private readonly options: { capacity: number; refillPerSecond: number; now: () => number }) {}

  take(key: string, cost = 1): TakeResult {
    // TODO: refill by elapsed time (capped at capacity), then spend cost or report retryAfterMs; RangeError for cost outside 1..capacity.
    throw new Error("Not implemented: TokenBucket.take");
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
    // TODO: dailyLimit minus settled usage and open reservations for this user's UTC day, never below 0.
    throw new Error("Not implemented: TokenBudget.remaining");
  }

  reserve(userId: string, inputTokens: number, requestedOutputTokens: number): Reservation {
    // TODO: grant min(requested, remaining - input) output tokens; refuse below 1; hold input + granted tokens under id <user>#<n>.
    throw new Error("Not implemented: TokenBudget.reserve");
  }

  settle(id: string, actualTokens: number): void {
    // TODO: close the reservation and record actual usage against its day; throw for unknown or already-settled IDs.
    throw new Error("Not implemented: TokenBudget.settle");
  }
}
