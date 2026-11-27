export interface VectorItem {
  id: string;
  vector: number[];
}

export interface Scored {
  id: string;
  score: number;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  // TODO: dot product divided by the product of the vector lengths.
  throw new Error("Not implemented: cosineSimilarity");
}

export function vectorSearch(queryVector: number[], items: VectorItem[], top = 5): Scored[] {
  // TODO: score every item, highest first, ties by id, at most `top`.
  throw new Error("Not implemented: vectorSearch");
}
