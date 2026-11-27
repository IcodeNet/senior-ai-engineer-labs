# 03 · Lexical retrieval with BM25

## Why it matters
BM25 is the default full-text ranking in Azure AI Search (and Elasticsearch, OpenSearch, Lucene). It still wins on exact identifiers — policy numbers, product codes, error messages — where embeddings blur meaning. Knowing its three levers lets you explain *why* a result ranked where it did:

- **IDF** — rare terms matter more: `idf = ln(1 + (N − df + 0.5) / (df + 0.5))`
- **Term-frequency saturation (`k1`)** — the tenth mention of a word adds far less than the first.
- **Length normalisation (`b`)** — a match in a short chunk counts for more than the same match in a long one.

For each query term: `idf × tf × (k1 + 1) / (tf + k1 × (1 − b + b × len / avgLen))`, summed over the query's distinct terms.

## Interview question
> Users search for "ERR-4021" and the assistant answers about unrelated errors. Your system uses vector search only. Explain the failure and what you would change.

## Your task
Implement in `index.ts`:

- `terms(text)` — lower-case, split on anything that is not a letter or digit, drop empty strings.
- `bm25Search(query, chunks, options)` with defaults `k1 = 1.2`, `b = 0.75`, `top = 5`:
  - score each chunk with the formula above over the **distinct** query terms;
  - return only chunks with a score above zero, highest first, ties broken by `id` ascending, at most `top` results.

## Going further
Azure AI Search exposes `k1`/`b` on a custom similarity, analyzers (stemming, synonyms, language-specific tokenisation) and scoring profiles that boost fields such as `title`.
