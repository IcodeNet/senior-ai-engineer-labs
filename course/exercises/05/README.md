# 05 · Hybrid retrieval with Reciprocal Rank Fusion

## Why it matters
BM25 is precise on exact terms; vectors are robust to wording. **Hybrid** search runs both and merges the lists. The scores are not comparable — a BM25 score of 7.3 and a cosine of 0.82 live on different scales — so Azure AI Search fuses by **rank** using Reciprocal Rank Fusion:

`score(d) = Σ over each ranking of 1 / (k + rank(d))`, with 1-based ranks and `k = 60` by default.

A chunk that ranks reasonably in both lists beats one that ranks first in only one. Semantic reranking (a cross-encoder) can then reorder the fused top results — that is a separate, paid Azure feature and is not emulated here.

## Interview question
> Why not just normalise BM25 and cosine scores to 0–1 and average them? When might RRF be the wrong choice?

## Your task
Implement in `index.ts`:

- `reciprocalRankFusion(rankings, { k = 60, top = 5 })` — each ranking is a list of IDs, best first.
  - Ranks are 1-based; an ID missing from a ranking contributes nothing for it.
  - If an ID appears more than once in the same ranking, only its first (best) position counts.
  - Return `{ id, score }` highest first, ties by `id` ascending, at most `top`.
- `hybridSearch(lexical, vector, options)` — fuse two scored result lists (already sorted best first) by their order.

## Going further
Weighted RRF, choosing how many candidates each retriever contributes (Azure's `k` for vector queries), and measuring whether hybrid actually beats either retriever on your labelled set (step 07).
