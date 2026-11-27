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

function check(rule: Rule, baseline: Metrics, current: Metrics): RuleResult {
  const { metric, better = "higher", floor, ceiling, tolerance } = rule;
  const fail = (message: string): RuleResult => ({ metric, status: "fail", message });
  const value = current[metric];
  if (value === undefined || !Number.isFinite(value)) return { metric, status: "missing", message: `${metric}: missing from the current run` };
  if (better === "higher" && floor !== undefined && value < floor - EPSILON)
    return fail(`${metric}: ${format(value)} is below the floor ${format(floor)}`);
  if (better === "lower" && ceiling !== undefined && value > ceiling + EPSILON)
    return fail(`${metric}: ${format(value)} is above the ceiling ${format(ceiling)}`);
  const base = baseline[metric];
  if (base !== undefined && tolerance !== undefined) {
    const worsening = better === "higher" ? base - value : value - base;
    if (worsening > tolerance + EPSILON)
      return fail(`${metric}: ${better === "higher" ? "fell" : "rose"} from ${format(base)} to ${format(value)} (tolerance ${format(tolerance)})`);
  }
  return { metric, status: "pass", message: `${metric}: ok` };
}

export function evaluateGate(baseline: Metrics, current: Metrics, rules: Rule[]): Gate {
  const results = rules.map((rule) => check(rule, baseline, current));
  return { passed: results.every((result) => result.status === "pass"), results };
}

export function ratchetBaseline(baseline: Metrics, current: Metrics, gate: Gate, rules: Rule[]): Metrics {
  if (!gate.passed) throw new Error("cannot update the baseline from a failing run");
  const next = { ...baseline };
  for (const rule of rules) next[rule.metric] = current[rule.metric];
  return next;
}
