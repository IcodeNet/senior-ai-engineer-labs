import { createHash } from "node:crypto";

export type Embed = (text: string) => number[];

export interface CacheScope {
  tenantId: string;
  groups: string[];
  /** Step 30's clearance level: a lower-cleared colleague never shares a key with a higher-cleared one. */
  clearance: string;
  model: string;
  promptVersion: string;
}

export interface CachedAnswer {
  text: string;
  sources: { id: string; version: number }[];
}

export type CacheLookup =
  | { hit: true; answer: CachedAnswer; similarity: number }
  | { hit: false; reason: "miss" | "expired" | "stale" | "forbidden" };

export type StoreResult = { stored: true } | { stored: false; reason: "personalised" | "ungrounded" | "contains-pii" };

export interface CacheOptions {
  embed: Embed;
  threshold: number;
  ttlMs: number;
  now: () => number;
  /** The current version of a source document, or undefined if it no longer exists. */
  currentVersion: (docId: string) => number | undefined;
}

/** What the cache keeps: a hash of the normalised question, never its text. */
export interface Entry {
  questionHash: string;
  vector: number[];
  answer: CachedAnswer;
  storedAt: number;
}

/** A coarse, deliberately over-eager PII check (step 31 does this properly): placeholders, emails, long digit runs, IBAN-like strings. */
export function containsPii(text: string): boolean {
  return [
    /\[(?:EMAIL|CARD|IBAN|NINO)_\d+\]/,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/,
    /\d(?:[ -]?\d){12,}/,
    /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,}/,
  ].some((pattern) => pattern.test(text));
}

export function hashQuestion(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

export function normalizeQuestion(question: string): string {
  // TODO: lower-case, collapse whitespace, trim, and strip trailing ? ! or . characters.
  throw new Error("Not implemented: normalizeQuestion");
}

export function scopeKey(scope: CacheScope): string {
  // TODO: tenantId|sorted groups joined by commas|clearance|model|promptVersion.
  throw new Error("Not implemented: scopeKey");
}

export function cosine(a: number[], b: number[]): number {
  // TODO: dot product over the product of norms; 0 if either norm is 0; RangeError on length mismatch.
  throw new Error("Not implemented: cosine");
}

export class SemanticCache {
  private readonly entries = new Map<string, Entry[]>();

  constructor(private readonly options: CacheOptions) {}

  /** The stored entries for a scope, for audits and tests. */
  entriesFor(scope: CacheScope): readonly Entry[] {
    return this.entries.get(scopeKey(scope)) ?? [];
  }

  set(scope: CacheScope, question: string, answer: CachedAnswer, flags: { personalised?: boolean } = {}): StoreResult {
    // TODO: refuse personalised, source-less and PII-bearing questions or answers; store the question hash, never its text.
    throw new Error("Not implemented: SemanticCache.set");
  }

  get(scope: CacheScope, question: string, canRead: (docId: string) => boolean): CacheLookup {
    // TODO: best match in this scope (same hash = 1, else cosine); miss, expired, stale, then re-check canRead for every source.
    throw new Error("Not implemented: SemanticCache.get");
  }

  invalidateDocument(docId: string): number {
    // TODO: remove entries citing docId from every scope and return how many were removed.
    throw new Error("Not implemented: SemanticCache.invalidateDocument");
  }
}
