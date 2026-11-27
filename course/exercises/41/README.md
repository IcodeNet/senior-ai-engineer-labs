# 41 · Choosing a retrieval strategy from requirements

## Why it matters
"Use a vector database" is not a design. A senior engineer derives the retrieval strategy from requirements and can say **why**:

- **Structured data** (positions, prices, tickets) belongs in SQL or an API call, not in embeddings. Retrieval is for prose.
- **A small, stable corpus** that fits comfortably in the context window may not need retrieval at all (here: at most half the window, leaving room for instructions and output).
- **Keyword queries and exact identifiers** (ISINs, error codes, ticket numbers) need lexical matching: BM25 finds `GB00B03MLX29`, embeddings blur it.
- **Natural-language and multilingual questions** need semantic matching: vectors.
- **Both** → **hybrid** with fusion (step 05).
- **Precision-critical** answers benefit from a reranker — *if* search time plus rerank time fits the retrieval budget: they run one after the other, so their times add (step 39).
- **Per-document permissions** need security trimming in the backend query (step 02), and **freshness under an hour** needs incremental indexing, not nightly rebuilds.

Returning **reason codes** alongside the decision makes it reviewable: the design document can quote them, and a test pins each rule.

## Interview question
> Design retrieval for an internal assistant over 2 million fund documents. Users ask both "what is the redemption policy for the global equity fund?" and "show me the KID for LU1234567890". Some documents are restricted to specific teams. What do you build and why?

## Model answer outline
- Requirements first: corpus size (far beyond a context window), query mix (semantic and exact codes), access control, freshness, latency budget, languages.
- Hybrid: BM25 for identifiers and rare terms, vectors for paraphrase; fuse with RRF; rerank the top 50 to the top 5 if the budget allows.
- Security trimming in the search filter from the caller's groups — never ask the model to hide restricted text.
- Indexing: chunking with metadata, versioning and revocation (steps 01–02); incremental updates if documents change during the day.
- Validate with a labelled set (Recall@K, NDCG) per query type, because hybrid can help one type and hurt another; route identifier-only queries straight to a lookup.

## Your task
Implement `chooseRetrieval(req)` in `index.ts`, returning `{ strategy, reranker, controls, reasons }`. Apply the rules in this order and push reasons in this order:

1. `structuredData` → `"structured-query"`, reason `structured-source`.
2. Otherwise, `corpusTokens <= contextWindowTokens / 2` → `"long-context"`, reason `corpus-fits-context`.
3. Otherwise push the query-style reason (`keyword-queries`, `semantic-queries` or `mixed-queries`), then `exact-identifiers` and `multilingual` when true. Then decide:
   - **lexical** matching is needed when the style is `keyword` or `mixed`, *or* there are exact identifiers;
   - **semantic** matching is needed when the style is `natural-language` or `mixed`, *or* the corpus is multilingual;
   - both → `"hybrid"`, lexical only → `"bm25"`, semantic only → `"vector"`.

   If `precisionCritical`: reranker when `retrievalLatencyMs + rerankLatencyMs <= retrievalBudgetMs` (reason `precision-critical`), otherwise no reranker (reason `rerank-over-budget`).
4. For any strategy: `documentLevelAccess` → control `security-trimming`, reason `document-acl`.
5. For index-based strategies (`bm25`, `vector`, `hybrid`) with `freshnessMinutes < 60` → control `incremental-indexing`, reason `near-real-time`.

Throw `RangeError` for negative or non-finite numeric requirements.

## Going further
Add a query router (identifier lookups bypass retrieval), a cost input that rules out rerankers at high volume, and a rule for semi-structured tables (extract to SQL, or chunk by row with headers).
