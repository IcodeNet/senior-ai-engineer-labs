export interface Analyzer {
  lowercase: boolean;
  /** Compared after lower-casing. Azure's standard analyzer has an empty stopword list unless you configure one. */
  stopwords: string[];
}

export interface Token {
  term: string;
  /** Position in the original token stream. Removing a stopword leaves a gap, so phrase queries stay honest. */
  position: number;
}

export interface Posting {
  id: string;
  tf: number;
  positions: number[];
}

export interface InvertedIndex {
  docCount: number;
  /** Number of indexed tokens per document, after stopword removal. BM25 needs it. */
  docLength: Record<string, number>;
  /** Term → postings, sorted by document id. */
  postings: Record<string, Posting[]>;
}

export const STANDARD: Analyzer = { lowercase: true, stopwords: [] };
export const ENGLISH_STOP: Analyzer = { lowercase: true, stopwords: ["a", "an", "and", "the", "of", "to", "in", "is", "for", "my", "do", "i"] };

/**
 * A simplified standard tokenizer: runs of letters and digits; an apostrophe between letters stays inside the word
 * ("northbank's"); a dot or comma between digits stays inside the number ("39.9"). Everything else separates tokens,
 * so "ERR-4021" becomes "ERR" and "4021". The real standard tokenizer follows Unicode text segmentation (UAX #29).
 */
export function tokenize(text: string): string[] {
  // TODO: match runs of \p{L}\p{N}; join an apostrophe between letters and a dot or comma between digits.
  throw new Error("Not implemented: tokenize");
}

export function analyze(text: string, analyzer: Analyzer): Token[] {
  // TODO: tokenize, lower-case if asked, drop stopwords but keep each surviving token's original position.
  throw new Error("Not implemented: analyze");
}

export function buildIndex(docs: { id: string; text: string }[], analyzer: Analyzer): InvertedIndex {
  // TODO: sort docs by id; per document count positions per term; docLength = tokens kept; reject duplicate ids.
  throw new Error("Not implemented: buildIndex");
}

/** Analyze the query with the same analyzer as the index, or terms will not line up. */
function queryTerms(index: InvertedIndex, query: string, analyzer: Analyzer): string[][] {
  return [...new Set(analyze(query, analyzer).map((t) => t.term))].map((term) => (index.postings[term] ?? []).map((p) => p.id));
}

/** searchMode "any": documents containing at least one query term. */
export function matchAny(index: InvertedIndex, query: string, analyzer: Analyzer): string[] {
  // TODO: analyze the query with the same analyzer; union of postings ids, sorted.
  throw new Error("Not implemented: matchAny");
}

/** searchMode "all": documents containing every query term. A query that analyzes to nothing matches nothing. */
export function matchAll(index: InvertedIndex, query: string, analyzer: Analyzer): string[] {
  // TODO: intersection of postings ids for every distinct query term, sorted; nothing for an empty query.
  throw new Error("Not implemented: matchAll");
}
