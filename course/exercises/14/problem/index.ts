/** Small, fast, seeded PRNG returning numbers in [0, 1). Deterministic for a given seed. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BootstrapOptions {
  iterations?: number;
  confidence?: number;
  seed?: number;
}

export interface Interval {
  mean: number;
  low: number;
  high: number;
}

export interface Comparison {
  meanDifference: number;
  low: number;
  high: number;
  decision: "improved" | "regressed" | "inconclusive";
}

export function pairedDifferences(baseline: number[], candidate: number[]): number[] {
  // TODO: candidate - baseline per query.
  throw new Error("Not implemented: pairedDifferences");
}

export function percentile(sorted: number[], p: number): number {
  // TODO: linear interpolation at position p * (n - 1).
  throw new Error("Not implemented: percentile");
}

export function bootstrapMeanCI(values: number[], options: BootstrapOptions = {}): Interval {
  // TODO: resample with replacement using mulberry32(seed) and take percentiles of the means.
  throw new Error("Not implemented: bootstrapMeanCI");
}

export function compareSystems(baseline: number[], candidate: number[], options: BootstrapOptions = {}): Comparison {
  // TODO: bootstrap the paired differences and decide.
  throw new Error("Not implemented: compareSystems");
}
