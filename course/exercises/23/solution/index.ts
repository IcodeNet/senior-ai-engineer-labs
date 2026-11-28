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
  const top = options.top ?? 5;
  const skip = options.skip ?? 0;
  if (!Number.isInteger(top) || top < 1 || top > 50) throw new RangeError(`top must be 1–50, got ${top}`);
  if (!Number.isInteger(skip) || skip < 0) throw new RangeError(`skip must be a non-negative integer, got ${skip}`);
  const searchFields = options.searchFields ?? SEARCHABLE;
  for (const f of searchFields) if (!SEARCHABLE.includes(f)) throw new Error(`${f} is not searchable in the Northbank index`);
  for (const f of options.facets ?? []) if (!FACETABLE.includes(f.split(",")[0])) throw new Error(`${f} is not facetable in the Northbank index`);
  const request: SearchRequest = {
    search: search.trim() === "" ? "*" : search,
    queryType: options.queryType ?? "simple",
    searchMode: "any",
    searchFields: searchFields.join(","),
    select: SELECT.join(","),
    filter: withGovernance(options.filter, options.asOf),
    top,
    skip,
    count: true,
  };
  if (options.highlight) request.highlight = "chunk";
  if (options.facets?.length) request.facets = options.facets;
  return request;
}

/** POST /docs/search and map the response: @odata.count, @search.score, @search.highlights and @search.facets. */
export async function search(http: Http, endpoint: string, index: string, request: SearchRequest): Promise<SearchResult> {
  const response = await http({
    method: "POST",
    url: `${endpoint}/indexes/${encodeURIComponent(index)}/docs/search?api-version=${SEARCH_API}`,
    body: request,
    audience: "search",
  });
  if (response.status !== 200) throw new Error(`search failed: ${response.status} ${azureMessage(response)}`.trim());
  const body = response.body;
  return {
    count: body["@odata.count"] ?? body.value.length,
    hits: body.value.map((d: Record<string, any>) => ({
      id: d.id,
      title: d.title,
      chunk: d.chunk,
      sourceUri: d.sourceUri,
      status: d.status,
      effectiveDate: d.effectiveDate,
      expiryDate: d.expiryDate ?? null,
      score: d["@search.score"],
      highlights: d["@search.highlights"]?.chunk ?? [],
    })),
    facets: body["@search.facets"] ?? {},
  };
}

/** Defence in depth: the server filter is the control; this check proves it ran. Any ungoverned hit is a breach. */
export function assertGoverned(hits: Hit[], asOf: string): Hit[] {
  const at = `${asOf}T00:00:00Z`;
  const instant = (value: string) => new Date(value).toISOString();
  for (const hit of hits) {
    if (hit.status !== "approved") throw new Error(`governance breach: ${hit.id} has status ${hit.status}`);
    if (instant(hit.effectiveDate) > instant(at)) throw new Error(`governance breach: ${hit.id} is not in force until ${hit.effectiveDate}`);
    if (hit.expiryDate !== null && instant(hit.expiryDate) < instant(at)) throw new Error(`governance breach: ${hit.id} expired on ${hit.expiryDate}`);
  }
  return hits;
}
