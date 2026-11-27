# 07 · Measuring retrieval: Precision, Recall, MRR and NDCG

## Why it matters
"The answers look better" is not evidence. Retrieval quality is measured against a **labelled set**: queries with the chunks a reviewer judged relevant. With it you can compare chunk sizes, BM25 against hybrid, or K=5 against K=10, and catch regressions in CI.

For one query, with the top-K retrieved IDs:

- **Precision@K** — relevant results in the top K, divided by **K**.
- **Recall@K** — relevant results in the top K, divided by the number of relevant chunks.
- **Reciprocal rank** — `1 / rank` of the first relevant result (0 if none in the list); its mean over queries is **MRR**.
- **NDCG@K** — rewards graded relevance near the top: `DCG = Σ (2^rel − 1) / log2(position + 1)` with 1-based positions, divided by the DCG of the ideal ordering of the judged labels.

Start at **K = 5**, then compare K = 10 and K = 20: recall rises, precision usually falls, and the prompt gets longer and dearer.

## Interview question
> Recall@5 improved from 0.71 to 0.83 after switching to hybrid, but answer quality didn't change. What could explain that, and what would you measure next?

## Your task
Implement in `index.ts`. Each function takes the ranked retrieved IDs and `k`; throw `RangeError` unless `k` is a positive integer.

- `precisionAtK(retrieved, relevant, k)` and `recallAtK(retrieved, relevant, k)` — `relevant` is a `Set<string>`; throw `RangeError` from `recallAtK` when it is empty (an unlabelled query cannot be scored).
- `reciprocalRank(retrieved, relevant)`.
- `ndcgAtK(retrieved, grades, k)` — `grades` maps ID → relevance (0–3); unlisted IDs are 0; return 0 when the ideal DCG is 0.
- `meanOf(values)` — arithmetic mean; throw `RangeError` for an empty list.

Only the first occurrence of an ID in `retrieved` counts.

## Going further
Generation metrics (groundedness, answer relevance, citation precision) need an LLM judge or human review — covered in the evaluation lab. Keep the labelled set versioned next to the code.
