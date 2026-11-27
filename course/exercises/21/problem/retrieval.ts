// Working code from step 19. You do not need to change this file.
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
  return `status eq 'approved' and isLatest eq true and effectiveDate le ${now.toISOString()}`;
}

export function buildSearchRequest(mode: Mode, query: string, vector: number[] | undefined, options: { top: number; now: Date }): Record<string, unknown> {
  if (mode !== "keyword" && !vector) throw new Error(`${mode} search needs a query vector`);
  const request: Record<string, unknown> = {
    top: options.top,
    filter: approvalFilter(options.now),
    select: "id,docId,title,content,status,effectiveDate",
  };
  if (mode !== "vector") request.search = query;
  if (mode !== "keyword") request.vectorQueries = [{ kind: "vector", vector, k: options.top, fields: "contentVector" }];
  if (mode === "semantic") {
    request.queryType = "semantic";
    request.semanticConfiguration = "default";
  }
  return request;
}

export async function searchIndex(http: Http, endpoint: string, index: string, request: Record<string, unknown>): Promise<Hit[]> {
  const response = await http({
    method: "POST",
    url: `${endpoint}/indexes/${encodeURIComponent(index)}/docs/search?api-version=${SEARCH_API}`,
    body: request,
    audience: "search",
  });
  if (response.status !== 200) throw new Error(`search failed: ${response.status} ${response.body?.error?.message ?? ""}`.trim());
  return (response.body.value as Record<string, any>[]).map((doc) => ({
    id: doc.id,
    chunkId: Buffer.from(doc.id, "base64url").toString("utf8"),
    title: doc.title,
    content: doc.content,
    status: doc.status,
    effectiveDate: doc.effectiveDate,
    score: doc["@search.rerankerScore"] ?? doc["@search.score"],
  }));
}
