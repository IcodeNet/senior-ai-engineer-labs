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
  const problems = hnswProblems(parameters, name);
  if (problems.length) throw new RangeError(problems.map((p) => p.message).join("; "));
  return { name, kind: "hnsw" as const, hnswParameters: { ...HNSW_DEFAULTS, ...parameters } };
}

/** A vector field: searchable, never filterable, sortable or facetable, not returned in results. */
export function vectorField(name: string, dimensions: number, profile: string): Field {
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > MAX_DIMENSIONS) throw new RangeError(`dimensions must be 1–${MAX_DIMENSIONS}, got ${dimensions}`);
  return { name, type: "Collection(Edm.Single)", searchable: true, retrievable: false, dimensions, vectorSearchProfile: profile };
}

/**
 * The Northbank index with an explicit vector configuration: the HNSW profile the vector field uses, and an exhaustive
 * KNN algorithm and profile kept for exact comparisons. Adding them to the step 18 index is an in-place update.
 */
export function northbankVectorIndex(dimensions: number): IndexDefinition {
  const index = northbankIndex(dimensions);
  index.fields = index.fields.map((f) => (f.name === "contentVector" ? vectorField("contentVector", dimensions, "northbank-vector-profile") : f));
  index.vectorSearch = {
    algorithms: [hnswAlgorithm("northbank-hnsw"), { name: "northbank-exact", kind: "exhaustiveKnn", exhaustiveKnnParameters: { metric: "cosine" } }],
    profiles: [
      { name: "northbank-vector-profile", algorithm: "northbank-hnsw" },
      { name: "northbank-exact-profile", algorithm: "northbank-exact" },
    ],
  };
  return index;
}

/** Cross-check the vector parts of an index definition the way the service would reject them. */
export function validateVectorIndex(index: IndexDefinition): Problem[] {
  const problems: Problem[] = [];
  const vs = index.vectorSearch ?? { algorithms: [], profiles: [] };
  const names = (list: { name: string }[] | undefined, kind: string) => {
    const seen = new Set<string>();
    for (const item of list ?? []) {
      if (seen.has(item.name)) problems.push({ path: `vectorSearch.${kind}.${item.name}`, message: `duplicate ${kind} name ${item.name}` });
      seen.add(item.name);
    }
    return seen;
  };
  const algorithms = names(vs.algorithms, "algorithms");
  const profiles = names(vs.profiles, "profiles");
  const vectorizers = names(vs.vectorizers, "vectorizers");
  const compressions = names(vs.compressions, "compressions");
  for (const a of vs.algorithms) {
    if (a.kind === "hnsw") problems.push(...hnswProblems((a.hnswParameters ?? {}) as Partial<HnswParameters>, `vectorSearch.algorithms.${a.name}`));
    else if (a.kind !== "exhaustiveKnn") problems.push({ path: `vectorSearch.algorithms.${a.name}`, message: `unknown algorithm kind ${a.kind}` });
  }
  for (const p of vs.profiles) {
    if (!algorithms.has(p.algorithm)) problems.push({ path: `vectorSearch.profiles.${p.name}`, message: `profile ${p.name} uses unknown algorithm ${p.algorithm}` });
    if (p.vectorizer && !vectorizers.has(p.vectorizer)) problems.push({ path: `vectorSearch.profiles.${p.name}`, message: `profile ${p.name} uses unknown vectorizer ${p.vectorizer}` });
    if (p.compression && !compressions.has(p.compression)) problems.push({ path: `vectorSearch.profiles.${p.name}`, message: `profile ${p.name} uses unknown compression ${p.compression}` });
  }
  for (const f of index.fields.filter((f) => isVector(f.type))) {
    const at = `fields.${f.name}`;
    if (f.searchable !== true) problems.push({ path: at, message: "a vector field must be searchable" });
    for (const attr of ["filterable", "sortable", "facetable"] as const) if (f[attr]) problems.push({ path: at, message: `a vector field cannot be ${attr}` });
    if (!Number.isInteger(f.dimensions) || f.dimensions! < 1 || f.dimensions! > MAX_DIMENSIONS) problems.push({ path: at, message: `dimensions must be 1–${MAX_DIMENSIONS}` });
    if (!f.vectorSearchProfile || !profiles.has(f.vectorSearchProfile)) problems.push({ path: at, message: `vector field needs a declared profile, got ${f.vectorSearchProfile}` });
  }
  return problems;
}

/** Recall@k of an approximate result against the exact one: the share of the true k nearest that the approximation found. */
export function recallAtK(approximate: string[], exact: string[], k: number): number {
  const truth = exact.slice(0, k);
  if (!truth.length) throw new RangeError("exact results are empty");
  const found = new Set(approximate.slice(0, k));
  return truth.filter((id) => found.has(id)).length / truth.length;
}

/** Embed texts with the Azure OpenAI deployment, in batches, in input order, checking count and dimensions. */
export async function embedTexts(http: Http, env: Pick<AzureEnv, "openaiEndpoint" | "embeddingDeployment" | "dimensions">, texts: string[], batchSize = 16): Promise<number[][]> {
  const vectors: number[][] = [];
  const base = env.openaiEndpoint.endsWith("/") ? env.openaiEndpoint : `${env.openaiEndpoint}/`;
  for (let i = 0; i < texts.length; i += batchSize) {
    const input = texts.slice(i, i + batchSize);
    const response = await http({ method: "POST", url: `${base}openai/v1/embeddings`, body: { model: env.embeddingDeployment, input }, audience: "openai" });
    if (response.status !== 200) throw new Error(`embedding failed: ${response.status} ${azureMessage(response)}`.trim());
    const data = [...(response.body.data as { index: number; embedding: number[] }[])].sort((a, b) => a.index - b.index);
    if (data.length !== input.length) throw new Error(`embedding returned ${data.length} vectors for ${input.length} inputs`);
    for (const d of data) {
      if (d.embedding.length !== env.dimensions) throw new Error(`embedding has ${d.embedding.length} dimensions, index expects ${env.dimensions}`);
      vectors.push(d.embedding);
    }
  }
  return vectors;
}

/** Merge only the vector into documents that already exist: the text fields are untouched. */
export function vectorMergeActions(documents: SearchDocument[], vectors: number[][]): { "@search.action": "merge"; id: string; contentVector: number[] }[] {
  if (documents.length !== vectors.length) throw new RangeError(`${documents.length} documents but ${vectors.length} vectors`);
  return documents.map((d, i) => ({ "@search.action": "merge" as const, id: d.id, contentVector: vectors[i] }));
}

export interface VectorQueryRequest {
  vectorQueries: { kind: "vector"; vector: number[]; fields: string; k: number; exhaustive: boolean }[];
  filter: string;
  select: string;
  top: number;
}

/** A pure vector query over contentVector, governed like every other query; exhaustive asks for exact KNN. */
export function vectorQuery(vector: number[], k: number, asOf: string, exhaustive = false): VectorQueryRequest {
  if (!Number.isInteger(k) || k < 1) throw new RangeError("k must be a positive integer");
  return {
    vectorQueries: [{ kind: "vector" as const, vector, fields: "contentVector", k, exhaustive }],
    filter: governanceFilter(asOf),
    select: "id,title,chunk,sourceUri,status",
    top: k,
  };
}

export async function searchVectors(http: Http, endpoint: string, index: string, request: VectorQueryRequest): Promise<{ id: string; sourceUri: string; score: number }[]> {
  const response = await http({ method: "POST", url: `${endpoint}/indexes/${encodeURIComponent(index)}/docs/search?api-version=${SEARCH_API}`, body: request, audience: "search" });
  if (response.status !== 200) throw new Error(`vector search failed: ${response.status} ${azureMessage(response)}`.trim());
  return response.body.value.map((d: Record<string, any>) => ({ id: d.id, sourceUri: d.sourceUri, score: d["@search.score"] }));
}
