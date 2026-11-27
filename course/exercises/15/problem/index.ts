export type Metrics = Record<string, number>;

export interface Rule {
  metric: string;
  /** "higher" (default) for quality metrics, "lower" for latency and cost. */
  better?: "higher" | "lower";
  floor?: number;
  ceiling?: number;
  /** Allowed worsening against the baseline, in the metric's units. */
  tolerance?: number;
}

export interface RuleResult {
  metric: string;
  status: "pass" | "fail" | "missing";
  message: string;
}

export interface Gate {
  passed: boolean;
  results: RuleResult[];
}

export const EPSILON = 1e-9;

/** Short, stable number formatting for messages: at most four decimal places. */
export function format(value: number): string {
  return String(Number(value.toFixed(4)));
}

export function evaluateGate(baseline: Metrics, current: Metrics, rules: Rule[]): Gate {
  // TODO: missing, then floor/ceiling, then tolerance against the baseline; first failure per rule.
  throw new Error("Not implemented: evaluateGate");
}

export function ratchetBaseline(baseline: Metrics, current: Metrics, gate: Gate, rules: Rule[]): Metrics {
  // TODO: only from a passing run; copy ruled metrics from the current run.
  throw new Error("Not implemented: ratchetBaseline");
}
