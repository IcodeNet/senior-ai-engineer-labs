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

export function normaliseWeights(criteria: Criterion[]): Record<string, number> {
  // TODO: weights by name, summing to 1.
  throw new Error("Not implemented: normaliseWeights");
}

export function scoreOptions(options: Option[], criteria: Criterion[]): Scorecard {
  // TODO: eliminate on hard constraints, min-max normalise, weight, rank.
  throw new Error("Not implemented: scoreOptions");
}

export function sensitivity(options: Option[], criteria: Criterion[], change = 0.2): Sensitivity {
  // TODO: nudge each weight up and down and record winner changes.
  throw new Error("Not implemented: sensitivity");
}
