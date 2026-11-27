export function precisionAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  // TODO: relevant results in the top k, divided by k.
  throw new Error("Not implemented: precisionAtK");
}

export function recallAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  // TODO: relevant results in the top k, divided by the number of relevant chunks.
  throw new Error("Not implemented: recallAtK");
}

export function reciprocalRank(retrieved: string[], relevant: Set<string>): number {
  // TODO: 1 / rank of the first relevant result, or 0.
  throw new Error("Not implemented: reciprocalRank");
}

export function ndcgAtK(retrieved: string[], grades: Map<string, number>, k: number): number {
  // TODO: DCG of the retrieved order divided by DCG of the ideal order.
  throw new Error("Not implemented: ndcgAtK");
}

export function meanOf(values: number[]): number {
  // TODO: arithmetic mean.
  throw new Error("Not implemented: meanOf");
}
