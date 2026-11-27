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
  /** Time available for the whole retrieval stage (search plus any rerank), in milliseconds. */
  retrievalBudgetMs: number;
  /** Expected time of the search itself (lexical, vector or both in parallel), in milliseconds. */
  retrievalLatencyMs: number;
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

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative number`);
}

export function chooseRetrieval(req: RetrievalRequirements): RetrievalDecision {
  assertNonNegative("corpusTokens", req.corpusTokens);
  assertNonNegative("contextWindowTokens", req.contextWindowTokens);
  assertNonNegative("retrievalBudgetMs", req.retrievalBudgetMs);
  assertNonNegative("retrievalLatencyMs", req.retrievalLatencyMs);
  assertNonNegative("rerankLatencyMs", req.rerankLatencyMs);
  assertNonNegative("freshnessMinutes", req.freshnessMinutes);

  const reasons: Reason[] = [];
  const controls: Control[] = [];
  let strategy: Strategy;
  let reranker = false;

  if (req.structuredData) {
    strategy = "structured-query";
    reasons.push("structured-source");
  } else if (req.corpusTokens <= req.contextWindowTokens / 2) {
    strategy = "long-context";
    reasons.push("corpus-fits-context");
  } else {
    if (req.queryStyle === "keyword") reasons.push("keyword-queries");
    if (req.queryStyle === "natural-language") reasons.push("semantic-queries");
    if (req.queryStyle === "mixed") reasons.push("mixed-queries");
    if (req.exactIdentifiers) reasons.push("exact-identifiers");
    if (req.multilingual) reasons.push("multilingual");
    const lexical = req.queryStyle !== "natural-language" || req.exactIdentifiers;
    const semantic = req.queryStyle !== "keyword" || req.multilingual;
    strategy = lexical && semantic ? "hybrid" : lexical ? "bm25" : "vector";

    if (req.precisionCritical) {
      // Search and rerank run one after the other, so their times add (step 39).
      if (req.retrievalLatencyMs + req.rerankLatencyMs <= req.retrievalBudgetMs) {
        reranker = true;
        reasons.push("precision-critical");
      } else {
        reasons.push("rerank-over-budget");
      }
    }
  }

  if (req.documentLevelAccess) {
    controls.push("security-trimming");
    reasons.push("document-acl");
  }
  const indexed = strategy === "bm25" || strategy === "vector" || strategy === "hybrid";
  if (indexed && req.freshnessMinutes < 60) {
    controls.push("incremental-indexing");
    reasons.push("near-real-time");
  }
  return { strategy, reranker, controls, reasons };
}
