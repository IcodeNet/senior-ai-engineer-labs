import { SEARCH_API, type Http } from "./azure.ts";

export type Mode = "keyword" | "vector" | "hybrid" | "semantic";

export interface Hit {
  id: string;
  chunkId: string;
  title: string;
  content: string;
  status: string;
  effectiveDate: string;
  score: number;
}

/** Enforced by the backend on every query: approved, latest version, already effective. */
export function approvalFilter(now: Date): string {
  // TODO: OData filter for approved, latest, already-effective chunks.
  throw new Error("Not implemented: approvalFilter");
}

export function buildSearchRequest(mode: Mode, query: string, vector: number[] | undefined, options: { top: number; now: Date }): Record<string, unknown> {
  // TODO: request bodies for keyword, vector, hybrid and semantic search, always filtered.
  throw new Error("Not implemented: buildSearchRequest");
}

export async function searchIndex(http: Http, endpoint: string, index: string, request: Record<string, unknown>): Promise<Hit[]> {
  // TODO: POST to docs/search and map results back to chunk IDs, preferring the reranker score.
  throw new Error("Not implemented: searchIndex");
}
