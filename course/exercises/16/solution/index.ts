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
  const price = prices[record.model];
  if (!price) throw new Error(`no price for model ${record.model}`);
  for (const tokens of [record.inputTokens, record.outputTokens])
    if (!Number.isInteger(tokens) || tokens < 0) throw new RangeError("token counts must be non-negative integers");
  return (record.inputTokens / 1_000_000) * price.input + (record.outputTokens / 1_000_000) * price.output;
}

export function percentileNearestRank(values: number[], p: number): number {
  if (values.length === 0) throw new RangeError("cannot take a percentile of nothing");
  if (!(p >= 0 && p <= 100)) throw new RangeError("p must be between 0 and 100");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function summarise(
  records: RequestRecord[],
  prices: PriceTable,
  options: { monthlyQueries: number; monthlyBudget: number },
): Summary {
  if (records.length === 0) throw new RangeError("no requests to summarise");
  const totalCost = records.reduce((sum, record) => sum + requestCost(record, prices), 0);
  const costPerQuery = totalCost / records.length;
  const latencies = records.map((record) => record.latencyMs);
  const projectedMonthlyCost = costPerQuery * options.monthlyQueries;
  return {
    queries: records.length,
    totalCost,
    costPerQuery,
    p50Ms: percentileNearestRank(latencies, 50),
    p95Ms: percentileNearestRank(latencies, 95),
    projectedMonthlyCost,
    withinBudget: projectedMonthlyCost <= options.monthlyBudget,
  };
}
