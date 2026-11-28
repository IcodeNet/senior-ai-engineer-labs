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
  return text.match(/[\p{L}\p{N}]+(?:(?:(?<=\p{L})['’](?=\p{L})|(?<=\p{N})[.,](?=\p{N}))[\p{L}\p{N}]+)*/gu) ?? [];
}

export function analyze(text: string, analyzer: Analyzer): Token[] {
  const stop = new Set(analyzer.stopwords.map((w) => w.toLowerCase()));
  const tokens: Token[] = [];
  tokenize(text).forEach((raw, position) => {
    const term = analyzer.lowercase ? raw.toLowerCase() : raw;
    if (!stop.has(term.toLowerCase())) tokens.push({ term, position });
  });
  return tokens;
}

export function buildIndex(docs: { id: string; text: string }[], analyzer: Analyzer): InvertedIndex {
  const postings: Record<string, Posting[]> = {};
  const docLength: Record<string, number> = {};
  const ids = new Set<string>();
  for (const doc of [...docs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    if (ids.has(doc.id)) throw new Error(`duplicate document id: ${doc.id}`);
    ids.add(doc.id);
    const tokens = analyze(doc.text, analyzer);
    docLength[doc.id] = tokens.length;
    const perTerm = new Map<string, number[]>();
    for (const { term, position } of tokens) {
      if (!perTerm.has(term)) perTerm.set(term, []);
      perTerm.get(term)!.push(position);
    }
    for (const [term, positions] of perTerm) (postings[term] ??= []).push({ id: doc.id, tf: positions.length, positions });
  }
  return { docCount: docs.length, docLength, postings };
}

/** Analyze the query with the same analyzer as the index, or terms will not line up. */
function queryTerms(index: InvertedIndex, query: string, analyzer: Analyzer): string[][] {
  return [...new Set(analyze(query, analyzer).map((t) => t.term))].map((term) => (index.postings[term] ?? []).map((p) => p.id));
}

/** searchMode "any": documents containing at least one query term. */
export function matchAny(index: InvertedIndex, query: string, analyzer: Analyzer): string[] {
  return [...new Set(queryTerms(index, query, analyzer).flat())].sort();
}

/** searchMode "all": documents containing every query term. A query that analyzes to nothing matches nothing. */
export function matchAll(index: InvertedIndex, query: string, analyzer: Analyzer): string[] {
  const lists = queryTerms(index, query, analyzer);
  if (lists.length === 0) return [];
  return lists.reduce((acc, ids) => acc.filter((id) => ids.includes(id))).sort();
}
