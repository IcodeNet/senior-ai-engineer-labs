export interface RetrievalRequirements {
  /** Size of the whole corpus in tokens. */
  corpusTokens: number;
  contextWindowTokens: number;
  /** Answers come from rows in a database or an API, not from prose. */
  structuredData: boolean;
  queryStyle: "keyword" | "natural-language" | "mixed";
  /** Queries contain codes that must match exactly: ISINs, ticket IDs, product codes. */
  exactIdentifiers: boolean;
  multilingual: boolean;
  precisionCritical: boolean;
  /** Time available for the retrieval stage, in milliseconds. */
  retrievalBudgetMs: number;
  rerankLatencyMs: number;
  documentLevelAccess: boolean;
  /** How quickly a document change must be searchable. */
  freshnessMinutes: number;
}

export type Strategy = "structured-query" | "long-context" | "bm25" | "vector" | "hybrid";

export type Reason =
  | "structured-source"
  | "corpus-fits-context"
  | "keyword-queries"
  | "semantic-queries"
  | "mixed-queries"
  | "exact-identifiers"
  | "multilingual"
  | "precision-critical"
  | "rerank-over-budget"
  | "document-acl"
  | "near-real-time";

export type Control = "security-trimming" | "incremental-indexing";

export interface RetrievalDecision {
  strategy: Strategy;
  reranker: boolean;
  controls: Control[];
  reasons: Reason[];
}

export function chooseRetrieval(req: RetrievalRequirements): RetrievalDecision {
  // TODO: apply the rules in order, recording a reason code for every choice.
  throw new Error("Not implemented: chooseRetrieval");
}
