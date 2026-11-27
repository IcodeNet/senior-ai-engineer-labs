export interface RequestRecord {
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

/** Price per million tokens, in one currency. Placeholder values in tests are not real prices. */
export type PriceTable = Record<string, { input: number; output: number }>;

export interface Summary {
  queries: number;
  totalCost: number;
  costPerQuery: number;
  p50Ms: number;
  p95Ms: number;
  projectedMonthlyCost: number;
  withinBudget: boolean;
}

export function requestCost(record: RequestRecord, prices: PriceTable): number {
  // TODO: input and output tokens at their per-million prices.
  throw new Error("Not implemented: requestCost");
}

export function percentileNearestRank(values: number[], p: number): number {
  // TODO: value at rank ceil(p / 100 * n) of the sorted list.
  throw new Error("Not implemented: percentileNearestRank");
}

export function summarise(
  records: RequestRecord[],
  prices: PriceTable,
  options: { monthlyQueries: number; monthlyBudget: number },
): Summary {
  // TODO: totals, cost per query, P50/P95, monthly projection and budget check.
  throw new Error("Not implemented: summarise");
}
