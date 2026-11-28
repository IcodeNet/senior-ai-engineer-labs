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
  if (df < 0 || df > docCount) throw new Error(`df must be between 0 and ${docCount}`);
  return Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
}

/** One term's contribution: saturating term frequency (k1) and length normalisation (b), scaled by idf. */
export function termWeight(tf: number, docLength: number, avgDocLength: number, termIdf: number, k1 = 1.2, b = 0.75): number {
  if (tf === 0) return 0;
  const norm = 1 - b + (b * docLength) / avgDocLength;
  return (termIdf * (tf * (k1 + 1))) / (tf + k1 * norm);
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
  const { k1 = 1.2, b = 0.75 } = options;
  const avg = averageLength(index);
  return distinctTerms(query, analyzer).map((term) => {
    const postings = index.postings[term] ?? [];
    const tf = postings.find((p) => p.id === id)?.tf ?? 0;
    const termIdf = idf(index.docCount, postings.length);
    return { term, tf, df: postings.length, idf: termIdf, weight: termWeight(tf, index.docLength[id] ?? 0, avg, termIdf, k1, b) };
  });
}

export function bm25(index: InvertedIndex, query: string, analyzer: Analyzer, options: Bm25Options = {}): Scored[] {
  const { k1 = 1.2, b = 0.75, top = 5 } = options;
  if (index.docCount === 0) return [];
  const avg = averageLength(index);
  const scores = new Map<string, number>();
  for (const term of distinctTerms(query, analyzer)) {
    const postings = index.postings[term] ?? [];
    const termIdf = idf(index.docCount, postings.length);
    for (const p of postings)
      scores.set(p.id, (scores.get(p.id) ?? 0) + termWeight(p.tf, index.docLength[p.id], avg, termIdf, k1, b));
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .filter((s) => s.score > 0)
    .sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .slice(0, top);
}
