# 04 · Vector retrieval with cosine similarity

## Why it matters
An embedding model maps text to a vector so that texts with similar **meaning** end up close together. Vector search then ranks chunks by similarity to the query vector — usually **cosine similarity**, the dot product of the two vectors divided by the product of their lengths. That is how "cancel my membership" finds a chunk about "terminating a subscription" even though no word matches.

Azure AI Search stores vectors in a `Collection(Edm.Single)` field and uses approximate nearest-neighbour search (HNSW) at scale; exhaustive KNN is the exact baseline you implement here.

`embedding.ts` provides a deterministic **toy** embedding: it maps a few synonyms to shared concepts and hashes words into 64 dimensions. It is enough to exercise the mechanics offline — it is not a real language model, so do not draw quality conclusions from it.

## Interview question
> Vector search returns plausible but wrong chunks for queries containing account numbers. Why, and what would you combine it with?

## Your task
Implement in `index.ts`:

- `cosineSimilarity(a, b)` — throw `RangeError` if the lengths differ; return `0` if either vector has zero length.
- `vectorSearch(queryVector, items, top = 5)` — score every item, return the highest first (ties by `id` ascending), at most `top`, excluding scores `<= 0`.

## Going further
Compare exhaustive KNN with HNSW (recall versus latency), choose dimensions and model per cost, and remember that changing the embedding model means re-embedding the whole index.
