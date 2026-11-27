export interface VectorItem {
  id: string;
  vector: number[];
}

export interface Scored {
  id: string;
  score: number;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new RangeError("vectors must have the same dimensions");
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function vectorSearch(queryVector: number[], items: VectorItem[], top = 5): Scored[] {
  return items
    .map((item) => ({ id: item.id, score: cosineSimilarity(queryVector, item.vector) }))
    .filter((item) => item.score > 0)
    .sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .slice(0, top);
}
