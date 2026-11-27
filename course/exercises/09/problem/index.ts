export interface EvalCase {
  id: string;
  query: string;
  /** chunk ID → relevance grade (1 = partially relevant, 3 = ideal evidence) */
  relevant: Record<string, number>;
}

export type Split = "dev" | "test";

/** 32-bit FNV-1a hash: stable across runs, platforms and input order. */
export function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function normaliseQuery(query: string): string {
  // TODO: lower-case, strip punctuation to spaces, collapse whitespace.
  throw new Error("Not implemented: normaliseQuery");
}

export function validateDataset(cases: EvalCase[], corpusIds: Set<string>): string[] {
  // TODO: report duplicates, empty queries, missing or invalid labels, unknown chunks and repeated queries.
  throw new Error("Not implemented: validateDataset");
}

export function assignSplit(id: string, testFraction: number): Split {
  // TODO: deterministic split from fnv1a(id).
  throw new Error("Not implemented: assignSplit");
}

export function splitDataset(cases: EvalCase[], testFraction: number): { dev: EvalCase[]; test: EvalCase[] } {
  // TODO: partition cases with assignSplit, preserving order.
  throw new Error("Not implemented: splitDataset");
}
