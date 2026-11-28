import { SEARCH_API, azureMessage, type Http } from "./azure.ts";
import { withGovernance, type Status } from "./northbank.ts";

export interface QueryOptions {
  /** The date governance is evaluated at, YYYY-MM-DD. Required: there is no ungoverned query. */
  asOf: string;
  filter?: string;
  top?: number;
  skip?: number;
  queryType?: "simple" | "full";
  searchFields?: string[];
  facets?: string[];
  highlight?: boolean;
}
export interface SearchRequest {
  search: string;
  queryType: "simple" | "full";
  searchMode: "any" | "all";
  searchFields: string;
  select: string;
  filter: string;
  top: number;
  skip: number;
  count: true;
  highlight?: string;
  facets?: string[];
}
export interface Hit {
  id: string;
  title: string;
  chunk: string;
  sourceUri: string;
  status: Status;
  effectiveDate: string;
  expiryDate: string | null;
  score: number;
  highlights: string[];
}
export interface SearchResult {
  count: number;
  hits: Hit[];
  facets: Record<string, { value: unknown; count: number }[]>;
}

/** What the application returns: content, citation and the governance fields it re-checks. Never the vector. */
export const SELECT = ["id", "title", "chunk", "sourceUri", "status", "effectiveDate", "expiryDate"];
const SEARCHABLE = ["title", "chunk"];
const FACETABLE = ["status"];

/** A search request that always carries the governance filter, asks only for searchable fields and returns citations. */
export function buildSearchRequest(search: string, options: QueryOptions): SearchRequest {
  // TODO: top 1–50 (default 5), skip ≥ 0, searchFields only title and chunk, facets only status; search "" becomes *; select SELECT; filter withGovernance(filter, asOf); count true; highlight chunk; facets when given.
  throw new Error("Not implemented: buildSearchRequest");
}

/** POST /docs/search and map the response: @odata.count, @search.score, @search.highlights and @search.facets. */
export async function search(http: Http, endpoint: string, index: string, request: SearchRequest): Promise<SearchResult> {
  // TODO: POST the request to /indexes/<index>/docs/search; map @odata.count, each document with @search.score and @search.highlights.chunk, and @search.facets; throw search failed: <status> <message>.
  throw new Error("Not implemented: search");
}

/** Defence in depth: the server filter is the control; this check proves it ran. Any ungoverned hit is a breach. */
export function assertGoverned(hits: Hit[], asOf: string): Hit[] {
  // TODO: throw governance breach: <id> … for a status other than approved, an effectiveDate after asOf or an expiryDate before it; otherwise return the hits.
  throw new Error("Not implemented: assertGoverned");
}
