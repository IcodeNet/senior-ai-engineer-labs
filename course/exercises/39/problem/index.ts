/** Per-request stage durations in milliseconds, keyed by stage name. */
export type Trace = Record<string, number>;

/** Serial groups of stages; stages inside one group run in parallel. */
export type Plan = string[][];

export interface StageBudget {
  name: string;
  weight: number;
  floorMs: number;
}

export interface Breach {
  stage: string;
  budgetMs: number;
  observedMs: number;
  overByMs: number;
}

/** Nearest-rank percentile (provided; you built it in step 16). */
export function percentileNearestRank(values: number[], p: number): number {
  if (values.length === 0 || p < 0 || p > 100) throw new RangeError("need values and 0 <= p <= 100");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export function endToEndMs(trace: Trace, plan: Plan): number {
  // TODO: sum over serial groups of the slowest stage in each group.
  throw new Error("Not implemented: endToEndMs");
}

export function endToEndP95(traces: Trace[], plan: Plan): number {
  // TODO: nearest-rank P95 of per-request end-to-end times.
  throw new Error("Not implemented: endToEndP95");
}

export function sumOfGroupP95s(traces: Trace[], plan: Plan): number {
  // TODO: the naive estimate, sum of each group's P95.
  throw new Error("Not implemented: sumOfGroupP95s");
}

export function allocateBudget(totalMs: number, stages: StageBudget[]): Record<string, number> {
  // TODO: floors first, then share the remainder by weight.
  throw new Error("Not implemented: allocateBudget");
}

export function budgetBreaches(allocation: Record<string, number>, observedP95: Record<string, number>): Breach[] {
  // TODO: stages over budget, largest overage first.
  throw new Error("Not implemented: budgetBreaches");
}
