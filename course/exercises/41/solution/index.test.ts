import { test } from "vitest";
import assert from "node:assert/strict";
import { chooseRetrieval, type RetrievalRequirements } from "./index.ts";

// A synthetic fund-documents assistant: large corpus, questions mix prose and ISIN codes.
const base: RetrievalRequirements = {
  corpusTokens: 50_000_000,
  contextWindowTokens: 200_000,
  structuredData: false,
  queryStyle: "mixed",
  exactIdentifiers: true,
  multilingual: false,
  precisionCritical: true,
  retrievalBudgetMs: 400,
  retrievalLatencyMs: 200,
  rerankLatencyMs: 150,
  documentLevelAccess: true,
  freshnessMinutes: 1440,
};

test("mixed queries with exact identifiers need hybrid retrieval, a reranker and security trimming", () => {
  assert.deepEqual(chooseRetrieval(base), {
    strategy: "hybrid",
    reranker: true,
    controls: ["security-trimming"],
    reasons: ["mixed-queries", "exact-identifiers", "precision-critical", "document-acl"],
  });
});

test("multilingual natural-language questions favour vector retrieval", () => {
  const decision = chooseRetrieval({
    ...base,
    queryStyle: "natural-language",
    exactIdentifiers: false,
    multilingual: true,
    precisionCritical: false,
    documentLevelAccess: false,
  });
  assert.deepEqual(decision, { strategy: "vector", reranker: false, controls: [], reasons: ["semantic-queries", "multilingual"] });
});

test("keyword search over fast-changing logs is BM25 with incremental indexing", () => {
  const decision = chooseRetrieval({
    ...base,
    queryStyle: "keyword",
    exactIdentifiers: false,
    precisionCritical: false,
    documentLevelAccess: false,
    freshnessMinutes: 5,
  });
  assert.deepEqual(decision, { strategy: "bm25", reranker: false, controls: ["incremental-indexing"], reasons: ["keyword-queries", "near-real-time"] });
});

test("exact identifiers add lexical matching to natural-language queries", () => {
  const decision = chooseRetrieval({ ...base, queryStyle: "natural-language", precisionCritical: false, documentLevelAccess: false });
  assert.deepEqual(decision, { strategy: "hybrid", reranker: false, controls: [], reasons: ["semantic-queries", "exact-identifiers"] });
});

test("multilingual requirements add semantic matching to keyword queries", () => {
  const decision = chooseRetrieval({
    ...base,
    queryStyle: "keyword",
    exactIdentifiers: false,
    multilingual: true,
    precisionCritical: false,
    documentLevelAccess: false,
  });
  assert.deepEqual(decision, { strategy: "hybrid", reranker: false, controls: [], reasons: ["keyword-queries", "multilingual"] });
});

test("search and rerank time add up against the retrieval budget", () => {
  assert.equal(chooseRetrieval({ ...base, retrievalLatencyMs: 250, rerankLatencyMs: 150 }).reranker, true); // exactly 400
  assert.equal(chooseRetrieval({ ...base, retrievalLatencyMs: 251, rerankLatencyMs: 150 }).reranker, false);
});

test("a reranker that does not fit the retrieval budget is left out, with the reason recorded", () => {
  const decision = chooseRetrieval({ ...base, retrievalLatencyMs: 300 }); // 300 + 150 > 400
  assert.equal(decision.strategy, "hybrid");
  assert.equal(decision.reranker, false);
  assert.deepEqual(decision.reasons, ["mixed-queries", "exact-identifiers", "rerank-over-budget", "document-acl"]);
});

test("structured data is queried at the source, not embedded", () => {
  assert.deepEqual(chooseRetrieval({ ...base, structuredData: true, freshnessMinutes: 1 }), {
    strategy: "structured-query",
    reranker: false,
    controls: ["security-trimming"],
    reasons: ["structured-source", "document-acl"],
  });
});

test("a small, stable corpus can skip retrieval and use the context window", () => {
  const decision = chooseRetrieval({ ...base, corpusTokens: 60_000, documentLevelAccess: false, freshnessMinutes: 10 });
  assert.deepEqual(decision, { strategy: "long-context", reranker: false, controls: [], reasons: ["corpus-fits-context"] });
  assert.equal(chooseRetrieval({ ...base, corpusTokens: 100_000 }).strategy, "long-context"); // exactly half the window
  assert.equal(chooseRetrieval({ ...base, corpusTokens: 100_001 }).strategy, "hybrid");
});

test("invalid requirements are rejected", () => {
  assert.throws(() => chooseRetrieval({ ...base, corpusTokens: -1 }), RangeError);
  assert.throws(() => chooseRetrieval({ ...base, retrievalBudgetMs: Number.NaN }), RangeError);
  assert.throws(() => chooseRetrieval({ ...base, retrievalLatencyMs: -5 }), RangeError);
});
