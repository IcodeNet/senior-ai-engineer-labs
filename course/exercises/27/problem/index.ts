import { SEARCH_API, azureMessage, type AzureEnv, type Http } from "./azure.ts";
import { governanceFilter, isVector, northbankIndex, type Field, type IndexDefinition, type SearchDocument } from "./northbank.ts";

export type VectorMetric = "cosine" | "dotProduct" | "euclidean" | "hamming";
export type HnswParameters = {
  m: number;
  efConstruction: number;
  efSearch: number;
  metric: VectorMetric;
};
export interface Problem {
  path: string;
  message: string;
}

/** Microsoft's documented defaults and ranges for HNSW in Azure AI Search. */
export const HNSW_DEFAULTS: HnswParameters = { m: 4, efConstruction: 400, efSearch: 500, metric: "cosine" };
export const HNSW_RANGES = { m: [4, 10], efConstruction: [100, 1000], efSearch: [100, 1000] } as const;
export const METRICS: readonly VectorMetric[] = ["cosine", "dotProduct", "euclidean", "hamming"];
export const MAX_DIMENSIONS = 4096;

function hnswProblems(p: Partial<HnswParameters>, path: string): Problem[] {
  const problems: Problem[] = [];
  for (const [key, [lo, hi]] of Object.entries(HNSW_RANGES) as [keyof typeof HNSW_RANGES, readonly [number, number]][]) {
    const value = p[key];
    if (value !== undefined && (!Number.isInteger(value) || value < lo || value > hi)) problems.push({ path: `${path}.${key}`, message: `${key} must be an integer from ${lo} to ${hi}, got ${value}` });
  }
  if (p.metric !== undefined && !METRICS.includes(p.metric)) problems.push({ path: `${path}.metric`, message: `unknown metric ${p.metric}` });
  return problems;
}

/** An HNSW algorithm configuration with the defaults filled in; out-of-range parameters are rejected. */
export function hnswAlgorithm(name: string, parameters: Partial<HnswParameters> = {}): { name: string; kind: "hnsw"; hnswParameters: HnswParameters } {
  // TODO: reject parameters outside HNSW_RANGES or an unknown metric (RangeError), then { name, kind: "hnsw", hnswParameters: defaults merged with the given ones }.
  throw new Error("Not implemented: hnswAlgorithm");
}

/** A vector field: searchable, never filterable, sortable or facetable, not returned in results. */
export function vectorField(name: string, dimensions: number, profile: string): Field {
  // TODO: Collection(Edm.Single), searchable, not retrievable, with dimensions (1–4096) and the profile.
  throw new Error("Not implemented: vectorField");
}

/**
 * The Northbank index with an explicit vector configuration: the HNSW profile the vector field uses, and an exhaustive
 * KNN algorithm and profile kept for exact comparisons. Adding them to the step 18 index is an in-place update.
 */
export function northbankVectorIndex(dimensions: number): IndexDefinition {
  // TODO: northbankIndex with contentVector from vectorField, algorithms northbank-hnsw (defaults) and northbank-exact (exhaustiveKnn, cosine), and a profile for each.
  throw new Error("Not implemented: northbankVectorIndex");
}

/** Cross-check the vector parts of an index definition the way the service would reject them. */
export function validateVectorIndex(index: IndexDefinition): Problem[] {
  // TODO: duplicate names; HNSW ranges and known kinds; profiles referencing existing algorithms, vectorizers and compressions; vector fields searchable, not filterable/sortable/facetable, 1–4096 dimensions, with a declared profile.
  throw new Error("Not implemented: validateVectorIndex");
}

/** Recall@k of an approximate result against the exact one: the share of the true k nearest that the approximation found. */
export function recallAtK(approximate: string[], exact: string[], k: number): number {
  // TODO: the share of the first k exact ids found in the first k approximate ids; empty exact results are an error.
  throw new Error("Not implemented: recallAtK");
}

/** Embed texts with the Azure OpenAI deployment, in batches, in input order, checking count and dimensions. */
export async function embedTexts(http: Http, env: Pick<AzureEnv, "openaiEndpoint" | "embeddingDeployment" | "dimensions">, texts: string[], batchSize = 16): Promise<number[][]> {
  // TODO: POST { model: deployment, input } to <openaiEndpoint>openai/v1/embeddings per batch with audience openai; sort data by index; check the count and the dimensions; throw embedding failed: <status> <message>.
  throw new Error("Not implemented: embedTexts");
}

/** Merge only the vector into documents that already exist: the text fields are untouched. */
export function vectorMergeActions(documents: SearchDocument[], vectors: number[][]): { "@search.action": "merge"; id: string; contentVector: number[] }[] {
  // TODO: one merge action per document with only id and contentVector; lengths must match.
  throw new Error("Not implemented: vectorMergeActions");
}

export interface VectorQueryRequest {
  vectorQueries: { kind: "vector"; vector: number[]; fields: string; k: number; exhaustive: boolean }[];
  filter: string;
  select: string;
  top: number;
}

/** A pure vector query over contentVector, governed like every other query; exhaustive asks for exact KNN. */
export function vectorQuery(vector: number[], k: number, asOf: string, exhaustive = false): VectorQueryRequest {
  // TODO: vectorQueries [{ kind vector, vector, fields contentVector, k, exhaustive }], the governance filter, select and top k.
  throw new Error("Not implemented: vectorQuery");
}

export async function searchVectors(http: Http, endpoint: string, index: string, request: VectorQueryRequest): Promise<{ id: string; sourceUri: string; score: number }[]> {
  // TODO: POST to docs/search and map id, sourceUri and @search.score; throw vector search failed: <status> <message>.
  throw new Error("Not implemented: searchVectors");
}
