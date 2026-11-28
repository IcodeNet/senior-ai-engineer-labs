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

/** Nearest-rank percentile (provided; you built it in Module 11). */
export function percentileNearestRank(values: number[], p: number): number {
  if (values.length === 0 || p < 0 || p > 100) throw new RangeError("need values and 0 <= p <= 100");
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

function stageMs(trace: Trace, name: string): number {
  const value = trace[name];
  if (value === undefined) throw new Error(`missing stage ${name}`);
  return value;
}

function groupMs(trace: Trace, group: string[]): number {
  return Math.max(...group.map(name => stageMs(trace, name)));
}

export function endToEndMs(trace: Trace, plan: Plan): number {
  return plan.reduce((total, group) => total + groupMs(trace, group), 0);
}

export function endToEndP95(traces: Trace[], plan: Plan): number {
  return percentileNearestRank(traces.map(trace => endToEndMs(trace, plan)), 95);
}

export function sumOfGroupP95s(traces: Trace[], plan: Plan): number {
  return plan.reduce((total, group) => total + percentileNearestRank(traces.map(trace => groupMs(trace, group)), 95), 0);
}

export function allocateBudget(totalMs: number, stages: StageBudget[]): Record<string, number> {
  if (stages.length === 0) throw new RangeError("no stages to budget");
  if (stages.some(stage => stage.weight < 0 || stage.floorMs < 0)) throw new RangeError("weights and floors must not be negative");
  const floors = stages.reduce((sum, stage) => sum + stage.floorMs, 0);
  if (floors > totalMs) throw new RangeError("floors exceed budget");
  const weights = stages.reduce((sum, stage) => sum + stage.weight, 0);
  if (weights === 0) throw new RangeError("at least one stage needs a positive weight");
  const remainder = totalMs - floors;
  return Object.fromEntries(stages.map(stage => [stage.name, stage.floorMs + (remainder * stage.weight) / weights]));
}

export function budgetBreaches(allocation: Record<string, number>, observedP95: Record<string, number>): Breach[] {
  return Object.entries(allocation)
    .map(([stage, budgetMs]) => {
      const observedMs = observedP95[stage];
      if (observedMs === undefined) throw new Error(`missing stage ${stage}`);
      return { stage, budgetMs, observedMs, overByMs: observedMs - budgetMs };
    })
    .filter(breach => breach.overByMs > 0)
    .sort((a, b) => b.overByMs - a.overByMs || a.stage.localeCompare(b.stage));
}
