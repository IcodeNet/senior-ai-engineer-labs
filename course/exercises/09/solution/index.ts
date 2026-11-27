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
  return query.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function validateDataset(cases: EvalCase[], corpusIds: Set<string>): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const seenQueries = new Map<string, string>();
  for (const item of cases) {
    if (seenIds.has(item.id)) {
      problems.push(`duplicate id: ${item.id}`);
      continue;
    }
    seenIds.add(item.id);
    if (item.query.trim() === "") problems.push(`${item.id}: empty query`);
    const labels = Object.entries(item.relevant);
    if (labels.length === 0) problems.push(`${item.id}: no relevant chunks`);
    for (const [chunk, grade] of labels)
      if (!Number.isInteger(grade) || grade < 1 || grade > 3)
        problems.push(`${item.id}: grade for ${chunk} must be an integer from 1 to 3`);
    for (const [chunk] of labels) if (!corpusIds.has(chunk)) problems.push(`${item.id}: unknown chunk ${chunk}`);
    const normalised = normaliseQuery(item.query);
    if (normalised !== "") {
      const earlier = seenQueries.get(normalised);
      if (earlier) problems.push(`${item.id}: same query as ${earlier}`);
      else seenQueries.set(normalised, item.id);
    }
  }
  return problems;
}

export function assignSplit(id: string, testFraction: number): Split {
  if (!(testFraction >= 0 && testFraction <= 1)) throw new RangeError("testFraction must be between 0 and 1");
  return fnv1a(id) % 10000 < testFraction * 10000 ? "test" : "dev";
}

export function splitDataset(cases: EvalCase[], testFraction: number): { dev: EvalCase[]; test: EvalCase[] } {
  const dev: EvalCase[] = [];
  const test: EvalCase[] = [];
  for (const item of cases) (assignSplit(item.id, testFraction) === "test" ? test : dev).push(item);
  return { dev, test };
}
