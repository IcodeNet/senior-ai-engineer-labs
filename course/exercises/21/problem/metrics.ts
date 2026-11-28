// Provided retrieval metrics (see the lesson's "What you're given"). You do not need to change this file.
function checkK(k: number): void {
  if (!Number.isInteger(k) || k <= 0) throw new RangeError("k must be a positive integer");
}

function topK(retrieved: string[], k: number): string[] {
  return [...new Set(retrieved)].slice(0, k);
}

export function precisionAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  checkK(k);
  return topK(retrieved, k).filter((id) => relevant.has(id)).length / k;
}

export function recallAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  checkK(k);
  if (relevant.size === 0) throw new RangeError("recall needs at least one relevant label");
  return topK(retrieved, k).filter((id) => relevant.has(id)).length / relevant.size;
}

export function reciprocalRank(retrieved: string[], relevant: Set<string>): number {
  const index = [...new Set(retrieved)].findIndex((id) => relevant.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

function dcg(gains: number[]): number {
  return gains.reduce((sum, rel, index) => sum + (2 ** rel - 1) / Math.log2(index + 2), 0);
}

export function ndcgAtK(retrieved: string[], grades: Map<string, number>, k: number): number {
  checkK(k);
  const actual = dcg(topK(retrieved, k).map((id) => grades.get(id) ?? 0));
  const ideal = dcg([...grades.values()].sort((a, b) => b - a).slice(0, k));
  return ideal === 0 ? 0 : actual / ideal;
}

export function meanOf(values: number[]): number {
  if (values.length === 0) throw new RangeError("cannot average an empty list");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
