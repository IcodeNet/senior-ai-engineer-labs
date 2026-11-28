import { analyze, type Analyzer, type InvertedIndex } from "./inverted.ts";

export interface Bm25Options {
  k1?: number;
  b?: number;
  top?: number;
}

export interface Scored {
  id: string;
  score: number;
}

export interface TermExplanation {
  term: string;
  tf: number;
  df: number;
  idf: number;
  weight: number;
}

/** Rarer terms weigh more. The +1 inside the log keeps idf positive even for a term in every document. */
export function idf(docCount: number, df: number): number {
  // TODO: ln(1 + (N − df + 0.5) / (df + 0.5)); throw when df is outside 0..N.
  throw new Error("Not implemented: idf");
}

/** One term's contribution: saturating term frequency (k1) and length normalisation (b), scaled by idf. */
export function termWeight(tf: number, docLength: number, avgDocLength: number, termIdf: number, k1 = 1.2, b = 0.75): number {
  // TODO: idf × tf × (k1 + 1) / (tf + k1 × (1 − b + b × docLength / avgDocLength)); 0 when tf is 0.
  throw new Error("Not implemented: termWeight");
}

function averageLength(index: InvertedIndex): number {
  const lengths = Object.values(index.docLength);
  return lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
}

function distinctTerms(query: string, analyzer: Analyzer): string[] {
  return [...new Set(analyze(query, analyzer).map((t) => t.term))];
}

/** Explain one document's score term by term, the question every relevance review starts with. */
export function explain(index: InvertedIndex, query: string, id: string, analyzer: Analyzer, options: Bm25Options = {}): TermExplanation[] {
  // TODO: one entry per distinct analyzed query term: tf in this document, df, idf and its termWeight.
  throw new Error("Not implemented: explain");
}

export function bm25(index: InvertedIndex, query: string, analyzer: Analyzer, options: Bm25Options = {}): Scored[] {
  // TODO: sum termWeight over distinct analyzed query terms for each document in the postings; drop zero scores; sort by score then id; keep top (default 5).
  throw new Error("Not implemented: bm25");
}
