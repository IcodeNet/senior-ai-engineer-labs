import type { Embedding } from "./embedders.ts";

export type Metric = "cosine" | "dotProduct" | "euclidean";
export interface Ranked {
  id: string;
  /** Higher is more similar for every metric; for euclidean it is the negated distance. */
  score: number;
}

function sameLength(a: number[], b: number[]): void {
  if (a.length !== b.length) throw new RangeError(`dimension mismatch: ${a.length} vs ${b.length}`);
}

export function dot(a: number[], b: number[]): number {
  sameLength(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

/** Scale to length 1. A zero vector has no direction and cannot be normalised. */
export function normalize(a: number[]): number[] {
  const length = norm(a);
  if (length === 0) throw new RangeError("cannot normalise a zero vector");
  return a.map((x) => x / length);
}

/** The cosine of the angle between two vectors: 1 same direction, 0 orthogonal, -1 opposite. Length does not matter. */
export function cosine(a: number[], b: number[]): number {
  const denominator = norm(a) * norm(b);
  if (denominator === 0) throw new RangeError("cosine is undefined for a zero vector");
  return dot(a, b) / denominator;
}

export function euclidean(a: number[], b: number[]): number {
  sameLength(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/** Vectors are comparable only if the same model produced them with the same number of dimensions. */
export function assertCompatible(query: Embedding, stored: Pick<Embedding, "model" | "dimensions">): void {
  if (query.model !== stored.model) throw new Error(`query embedded with ${query.model}, but the index holds ${stored.model} vectors`);
  if (query.dimensions !== stored.dimensions || query.vector.length !== stored.dimensions)
    throw new Error(`query has ${query.vector.length} dimensions, the index field has ${stored.dimensions}`);
}

/** Exhaustive ranking of items by similarity to the query, best first; ties keep input order. */
export function rank(query: Embedding, items: { id: string; embedding: Embedding }[], metric: Metric, k: number): Ranked[] {
  if (!Number.isInteger(k) || k < 1) throw new RangeError("k must be a positive integer");
  const score = (v: number[]) => (metric === "cosine" ? cosine(query.vector, v) : metric === "dotProduct" ? dot(query.vector, v) : -euclidean(query.vector, v));
  return items
    .map((item) => {
      assertCompatible(query, item.embedding);
      return { id: item.id, score: score(item.embedding.vector) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
