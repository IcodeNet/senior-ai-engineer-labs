export type Embed = (text: string) => number[];

export interface CacheScope {
  tenantId: string;
  groups: string[];
  model: string;
  promptVersion: string;
}

export interface CachedAnswer {
  text: string;
  sources: { id: string; version: number }[];
}

export type CacheLookup =
  | { hit: true; answer: CachedAnswer; similarity: number }
  | { hit: false; reason: "miss" | "expired" | "stale" };

export type StoreResult = { stored: true } | { stored: false; reason: "personalised" | "ungrounded" | "contains-pii" };

export interface CacheOptions {
  embed: Embed;
  threshold: number;
  ttlMs: number;
  now: () => number;
  /** The current version of a source document, or undefined if it no longer exists. */
  currentVersion: (docId: string) => number | undefined;
}

interface Entry {
  question: string;
  vector: number[];
  answer: CachedAnswer;
  storedAt: number;
}

const PLACEHOLDER = /\[(?:EMAIL|CARD|IBAN|NINO)_\d+\]/;

export function normalizeQuestion(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ").trim().replace(/[?!.]+$/, "").trim();
}

export function scopeKey(scope: CacheScope): string {
  return [scope.tenantId, [...scope.groups].sort().join(","), scope.model, scope.promptVersion].join("|");
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new RangeError("vectors differ in length");
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

export class SemanticCache {
  private readonly entries = new Map<string, Entry[]>();

  constructor(private readonly options: CacheOptions) {}

  set(scope: CacheScope, question: string, answer: CachedAnswer, flags: { personalised?: boolean } = {}): StoreResult {
    if (flags.personalised) return { stored: false, reason: "personalised" };
    if (answer.sources.length === 0) return { stored: false, reason: "ungrounded" };
    if (PLACEHOLDER.test(answer.text)) return { stored: false, reason: "contains-pii" };
    const key = scopeKey(scope);
    const normalized = normalizeQuestion(question);
    const list = (this.entries.get(key) ?? []).filter((entry) => entry.question !== normalized);
    list.push({ question: normalized, vector: this.options.embed(normalized), answer, storedAt: this.options.now() });
    this.entries.set(key, list);
    return { stored: true };
  }

  get(scope: CacheScope, question: string): CacheLookup {
    const key = scopeKey(scope);
    const list = this.entries.get(key) ?? [];
    const normalized = normalizeQuestion(question);
    const vector = this.options.embed(normalized);
    let best: Entry | undefined;
    let bestSimilarity = -Infinity;
    for (const entry of list) {
      const similarity = entry.question === normalized ? 1 : cosine(vector, entry.vector);
      if (similarity > bestSimilarity) {
        best = entry;
        bestSimilarity = similarity;
      }
    }
    if (!best || bestSimilarity < this.options.threshold) return { hit: false, reason: "miss" };
    const remove = (entry: Entry) => this.entries.set(key, list.filter((other) => other !== entry));
    if (this.options.now() - best.storedAt >= this.options.ttlMs) {
      remove(best);
      return { hit: false, reason: "expired" };
    }
    if (best.answer.sources.some((source) => this.options.currentVersion(source.id) !== source.version)) {
      remove(best);
      return { hit: false, reason: "stale" };
    }
    return { hit: true, answer: best.answer, similarity: bestSimilarity };
  }

  invalidateDocument(docId: string): number {
    let removed = 0;
    for (const [key, list] of this.entries) {
      const kept = list.filter((entry) => !entry.answer.sources.some((source) => source.id === docId));
      removed += list.length - kept.length;
      this.entries.set(key, kept);
    }
    return removed;
  }
}
