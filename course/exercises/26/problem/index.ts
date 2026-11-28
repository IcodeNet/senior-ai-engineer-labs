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
  // TODO: sum of products; throw RangeError dimension mismatch: <a> vs <b> for different lengths.
  throw new Error("Not implemented: dot");
}

export function norm(a: number[]): number {
  // TODO: the square root of a · a.
  throw new Error("Not implemented: norm");
}

/** Scale to length 1. A zero vector has no direction and cannot be normalised. */
export function normalize(a: number[]): number[] {
  // TODO: divide by the norm; throw RangeError for a zero vector.
  throw new Error("Not implemented: normalize");
}

/** The cosine of the angle between two vectors: 1 same direction, 0 orthogonal, -1 opposite. Length does not matter. */
export function cosine(a: number[], b: number[]): number {
  // TODO: a · b / (|a| |b|); throw RangeError for a zero vector.
  throw new Error("Not implemented: cosine");
}

export function euclidean(a: number[], b: number[]): number {
  // TODO: the square root of the summed squared differences; same lengths only.
  throw new Error("Not implemented: euclidean");
}

/** Vectors are comparable only if the same model produced them with the same number of dimensions. */
export function assertCompatible(query: Embedding, stored: Pick<Embedding, "model" | "dimensions">): void {
  // TODO: throw when the models differ or the dimensions differ (the declared value or the vector length).
  throw new Error("Not implemented: assertCompatible");
}

/** Exhaustive ranking of items by similarity to the query, best first; ties keep input order. */
export function rank(query: Embedding, items: { id: string; embedding: Embedding }[], metric: Metric, k: number): Ranked[] {
  // TODO: check compatibility of every item, score by metric (euclidean as minus the distance), sort best first, keep k; k must be a positive integer.
  throw new Error("Not implemented: rank");
}
