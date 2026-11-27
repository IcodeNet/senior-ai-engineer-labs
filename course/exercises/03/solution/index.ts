export interface Document {
  id: string;
  text: string;
}

export interface Scored {
  id: string;
  score: number;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
  top?: number;
}

export function terms(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((term) => term.length > 0);
}

export function bm25Search(query: string, chunks: Document[], options: Bm25Options = {}): Scored[] {
  const { k1 = 1.2, b = 0.75, top = 5 } = options;
  const docs = chunks.map((chunk) => ({ id: chunk.id, terms: terms(chunk.text) }));
  if (docs.length === 0) return [];
  const avgLength = docs.reduce((sum, doc) => sum + doc.terms.length, 0) / docs.length;
  const queryTerms = [...new Set(terms(query))];
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms)
    documentFrequency.set(term, docs.filter((doc) => doc.terms.includes(term)).length);

  const scored = docs.map((doc) => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = doc.terms.filter((t) => t === term).length;
      if (tf === 0) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
      const norm = avgLength === 0 ? 1 : doc.terms.length / avgLength;
      score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + b * norm));
    }
    return { id: doc.id, score };
  });
  return scored
    .filter((item) => item.score > 0)
    .sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .slice(0, top);
}
