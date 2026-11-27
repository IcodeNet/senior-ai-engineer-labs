export interface Criterion {
  name: string;
  /** Relative importance; weights are normalised to sum to 1. */
  weight: number;
  direction: "higher-is-better" | "lower-is-better";
  /** Hard constraints on the raw value: an option outside them is eliminated, whatever its score. */
  min?: number;
  max?: number;
}

export interface Option {
  name: string;
  values: Record<string, number>;
}

export interface Elimination {
  name: string;
  criterion: string;
  reason: "below-min" | "above-max";
}

export interface Scorecard {
  ranking: { name: string; score: number }[];
  eliminated: Elimination[];
  winner: string | null;
}

export interface Flip {
  criterion: string;
  direction: "increase" | "decrease";
  winner: string | null;
}

export interface Sensitivity {
  baseWinner: string | null;
  robust: boolean;
  flips: Flip[];
}

function value(option: Option, criterion: string): number {
  const v = option.values[criterion];
  if (v === undefined) throw new Error(`option ${option.name} has no value for ${criterion}`);
  return v;
}

export function normaliseWeights(criteria: Criterion[]): Record<string, number> {
  if (criteria.some(c => c.weight < 0)) throw new RangeError("weights must not be negative");
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (total === 0) throw new RangeError("at least one weight must be positive");
  return Object.fromEntries(criteria.map(c => [c.name, c.weight / total]));
}

export function scoreOptions(options: Option[], criteria: Criterion[]): Scorecard {
  const weights = normaliseWeights(criteria);
  const eliminated: Elimination[] = [];
  const eligible: Option[] = [];
  for (const option of options) {
    let failed: Elimination | null = null;
    for (const c of criteria) {
      const v = value(option, c.name);
      if (c.min !== undefined && v < c.min) failed = { name: option.name, criterion: c.name, reason: "below-min" };
      else if (c.max !== undefined && v > c.max) failed = { name: option.name, criterion: c.name, reason: "above-max" };
      if (failed) break;
    }
    if (failed) eliminated.push(failed);
    else eligible.push(option);
  }

  const scores = new Map(eligible.map(option => [option.name, 0]));
  for (const c of criteria) {
    const values = eligible.map(option => value(option, c.name));
    const low = Math.min(...values);
    const high = Math.max(...values);
    for (const option of eligible) {
      const raw = value(option, c.name);
      let normalised = high === low ? 1 : (raw - low) / (high - low);
      if (c.direction === "lower-is-better" && high !== low) normalised = 1 - normalised;
      scores.set(option.name, (scores.get(option.name) ?? 0) + weights[c.name] * normalised);
    }
  }
  const ranking = [...scores.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { ranking, eliminated, winner: ranking[0]?.name ?? null };
}

export function sensitivity(options: Option[], criteria: Criterion[], change = 0.2): Sensitivity {
  if (!(change > 0 && change < 1)) throw new RangeError("change must be strictly between 0 and 1");
  const baseWinner = scoreOptions(options, criteria).winner;
  const flips: Flip[] = [];
  for (const target of criteria) {
    for (const direction of ["increase", "decrease"] as const) {
      const factor = direction === "increase" ? 1 + change : 1 - change;
      const adjusted = criteria.map(c => (c.name === target.name ? { ...c, weight: c.weight * factor } : c));
      const winner = scoreOptions(options, adjusted).winner;
      if (winner !== baseWinner) flips.push({ criterion: target.name, direction, winner });
    }
  }
  return { baseWinner, robust: flips.length === 0, flips };
}
