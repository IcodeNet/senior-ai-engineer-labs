# 19 · Keyword, vector, hybrid and semantic search on Azure

> **Cost notice.** The live tests in this step call real, billable Azure resources created by the **Set up Azure** action (lesson 17). Azure AI Search Basic is charged for every hour it exists; Azure OpenAI is charged per token. The red cost banner shows while anything may exist. When you finish the lab, run **Shut down Azure** and then **Verify cost is zero** from the Actions tab (lesson 21; terminal: `npm run azure:down`, `npm run azure:verify`). Without Azure set up, the live tests are skipped and the offline tests still check your code.

## Why it matters
One index, four query strategies:

| Mode | Request | Strength |
|---|---|---|
| keyword | `search` (BM25) | exact terms, codes such as ERR-4021 |
| vector | `vectorQueries` | meaning and paraphrase |
| hybrid | both | the service fuses the two rankings with Reciprocal Rank Fusion: each document scores Σ 1/(k + rank) across the lists, so documents ranked well by both rise |
| semantic | hybrid + `queryType: semantic` | a cross-encoder reranks the fused top results |

Whatever the mode, the backend adds the **approval filter** built from its own clock — never from user input — so drafts, superseded versions and revoked documents cannot be retrieved. Semantic reranking returns `@search.rerankerScore` (0–4), which replaces the fused score for ordering. The semantic ranker here runs on its **free plan**: when the monthly allowance is used up, semantic queries return an error rather than a bill.

## Interview question
> Hybrid search finds the right policy but ranks it fourth; semantic reranking puts it first, but adds latency and cost. How do you decide whether to ship semantic ranking?

## Your task
Implement in `index.ts`:

- `approvalFilter(now)` — `status eq 'approved' and isLatest eq true and effectiveDate le <now as ISO>`.
- `buildSearchRequest(mode, query, vector, { top, now })` — always `top`, `filter` and `select: "id,docId,title,content,status,effectiveDate"`; add `search` except for vector mode; add `vectorQueries: [{ kind: "vector", vector, k: top, fields: "contentVector" }]` except for keyword mode; semantic also adds `queryType: "semantic"` and `semanticConfiguration: "default"`. Throw `<mode> search needs a query vector` when a vector mode has none.
- `searchIndex(http, endpoint, index, request)` — `POST .../docs/search`; map each result to a `Hit` with `chunkId` decoded from the key and `score` = reranker score if present, else search score; throw `search failed: <status> <message>`.

The live test prints all four rankings for one question — compare them.

## Going further
Tune hybrid with weighted vector queries, add scoring profiles that boost title matches, and log the query mode with every answer for later analysis.
