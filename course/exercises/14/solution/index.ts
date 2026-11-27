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
  if (baseline.length === 0 || baseline.length !== candidate.length) throw new RangeError("need paired, non-empty scores");
  return candidate.map((value, i) => value - baseline[i]);
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) throw new RangeError("cannot take a percentile of nothing");
  const position = p * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function bootstrapMeanCI(values: number[], options: BootstrapOptions = {}): Interval {
  const { iterations = 2000, confidence = 0.95, seed = 42 } = options;
  if (values.length === 0) throw new RangeError("cannot bootstrap an empty sample");
  const random = mulberry32(seed);
  const n = values.length;
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += values[Math.floor(random() * n)];
    means.push(sum / n);
  }
  means.sort((a, b) => a - b);
  const tail = (1 - confidence) / 2;
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / n,
    low: percentile(means, tail),
    high: percentile(means, 1 - tail),
  };
}

export function compareSystems(baseline: number[], candidate: number[], options: BootstrapOptions = {}): Comparison {
  const { mean, low, high } = bootstrapMeanCI(pairedDifferences(baseline, candidate), options);
  const decision = low > 0 ? "improved" : high < 0 ? "regressed" : "inconclusive";
  return { meanDifference: mean, low, high, decision };
}
