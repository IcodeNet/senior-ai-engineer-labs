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
  // TODO: lower-case, collapse whitespace, trim, and strip trailing ? ! or . characters.
  throw new Error("Not implemented: normalizeQuestion");
}

export function scopeKey(scope: CacheScope): string {
  // TODO: tenantId|sorted groups joined by commas|model|promptVersion.
  throw new Error("Not implemented: scopeKey");
}

export function cosine(a: number[], b: number[]): number {
  // TODO: dot product over the product of norms; 0 if either norm is 0; RangeError on length mismatch.
  throw new Error("Not implemented: cosine");
}

export class SemanticCache {
  private readonly entries = new Map<string, Entry[]>();

  constructor(private readonly options: CacheOptions) {}

  set(scope: CacheScope, question: string, answer: CachedAnswer, flags: { personalised?: boolean } = {}): StoreResult {
    // TODO: refuse personalised, source-less and placeholder-bearing answers; otherwise store (replacing the same normalised question).
    throw new Error("Not implemented: SemanticCache.set");
  }

  get(scope: CacheScope, question: string): CacheLookup {
    // TODO: best match in this scope only (exact = 1, else cosine); below threshold is a miss; expire, then check source versions.
    throw new Error("Not implemented: SemanticCache.get");
  }

  invalidateDocument(docId: string): number {
    // TODO: remove entries citing docId from every scope and return how many were removed.
    throw new Error("Not implemented: SemanticCache.invalidateDocument");
  }
}
