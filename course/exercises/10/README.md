# 10 · A retrieval evaluation harness

## Why it matters
Metrics become useful when one command answers "is this retriever better than the last one, and where does it fail?". A harness runs every labelled query, scores each one, averages them (**macro mean** — every query counts equally), and points at the worst queries so you can read them.

Two engineering details matter at scale:

- **Retrieve once at the largest K.** Comparing K = 5, 10 and 20 should slice one ranking, not call the search service three times — in Azure, each call costs latency and query units.
- **Fail loudly.** If retrieval throws for one query, the run must fail and say which; silently skipping it makes the average look better.

`metrics.ts` contains working Precision@K, Recall@K, reciprocal rank, NDCG@K and mean from step 07.

## Interview question
> Mean Recall@5 is 0.86 but stakeholders say search is "bad". How can a good average hide a bad experience, and what would you report instead?

## Your task
Implement in `index.ts`:

- `evaluateRetriever(cases, retriever, k = 5)`:
  - call `retriever(case.query)` once per case, in order; wrap any error as `Error("retrieval failed for <id>: <message>")`;
  - score the top `k` results: `precision`, `recall`, `mrr` (reciprocal rank within the top `k`), `ndcg` (using the grades); `missed` lists relevant IDs absent from the top `k`, sorted;
  - return `{ k, cases, mean, worst }` — `mean` averages each metric, `worst` holds up to 3 case IDs with the lowest recall (ties by ID).
- `compareK(cases, retriever, ks)` — retrieve **once** per case and return the mean metrics for every K in `ks`, keyed by K.

## Going further
Persist each run (dataset version, index version, config, metrics) so step 15 can gate regressions, and break results down by query type or document source.
