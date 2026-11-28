# 26 · Embeddings and similarity: cosine, dot product and normalisation

*Module 4 · Chunking and embeddings · step 2 of 4 · Track: TypeScript*

## Concept

An **embedding** is a vector of numbers that a model produces for a piece of text, placed so that texts with related meaning land near each other. Vector search embeds the query with the **same model**, then finds the stored chunks whose vectors are nearest. "Near" is a similarity metric.

```text
"What does an arranged overdraft cost?" ──embed──► q = [0.012, −0.031, …]  (1,536 numbers for text-embedding-3-small)
chunk vectors in the index ────────────────────────► d₁, d₂, …, dₙ
nearest = argmax cosine(q, dᵢ)  =  argmax (q · dᵢ) / (|q| |dᵢ|)
```

Why a senior engineer cares: embeddings make paraphrases findable ("am I charged for going overdrawn?" finds "unarranged overdraft"), but only if the query and the chunks were embedded by the same model with the same dimensions and compared with the metric that model was trained for. Get any of those wrong and the system returns confident nonsense without an error.

## Theory

**Three metrics.**

| Metric | Formula | Notes |
|---|---|---|
| `cosine` | a · b / (\|a\| \|b\|) | angle only; length does not matter; the metric Azure OpenAI embeddings are designed for |
| `dotProduct` | a · b | angle and length; identical to cosine on normalised vectors, and slightly faster |
| `euclidean` | \|a − b\| | straight-line distance; smaller is closer |

**Normalisation.** Dividing a vector by its length gives it length 1. For normalised vectors, cosine and dot product are the same number, and Euclidean distance ranks in the same order (|a − b|² = 2 − 2 a · b). OpenAI's embedding models return normalised vectors, which is why cosine and dot product agree for them. For unnormalised vectors from other models, the dot product rewards long vectors, so a long, loosely related chunk can outrank a short, precise one.

**Model and dimensions must match.** Each model defines its own space: the same sentence embedded by two models gives vectors with no meaningful relationship, as this step's toy models show. Dimensions are part of the space too: `text-embedding-3-small` can be asked for fewer than 1,536 dimensions, and those vectors are not comparable with full-length ones. Azure AI Search enforces the declared `dimensions` of a vector field; it cannot know which model produced a vector of the right length. Record the model (and version, and dimensions) next to the vectors, check it on every query path, and re-embed everything when you change models.

**What embeddings do not do.** They capture similarity, not truth or currency: an approved answer and the retired answer it supersedes embed almost identically, which is why the governance filter still applies to vector queries (Module 6). They are weak on exact tokens such as error codes and account numbers, where BM25 is strong; Module 5 combines both.

**Cost.** Embedding is per token at indexing time for every chunk, and per query. Re-chunking or changing the model means re-embedding the corpus.

## Check questions

```question
prompt: What is an embedding, and what must be true of the query and the indexed content for vector search to work?
answer: A numeric vector representing meaning, where similar texts are close; the query and the content must be embedded with the same model, the same dimensions and a consistent metric.
explanation: >-
  Vectors from different models, or the same model at different dimensions, live in different spaces. Comparing them
  produces numbers, not relevance.
source: handoff
```

```question
prompt: Your vectors are normalised to length 1. How do cosine similarity and dot product compare?
options:
  - Cosine is more accurate, dot product is faster but approximate
  - They give exactly the same value, so they rank identically; dot product is slightly cheaper
  - Dot product is better because it accounts for vector length
answer: They give exactly the same value, so they rank identically; dot product is slightly cheaper
explanation: >-
  With |a| = |b| = 1, a · b / (|a| |b|) is just a · b. Without normalisation, dot product mixes length into the score,
  which can rank a long, loosely related vector above a precise one.
```

```question
prompt: The team switches from text-embedding-3-small to text-embedding-3-large but only for new chunks. What happens to search quality?
answer: Old and new vectors live in different spaces (and have different dimensions, 1,536 vs 3,072, so they cannot even share a field); queries embedded with one model cannot be compared with chunks from the other, so the whole corpus must be re-embedded into a new field or index.
explanation: >-
  A model change is a migration: new vector field or index, full re-embedding, then cut over. Store the model name with
  the vectors so a mismatch is detectable.
```

```question
prompt: Why does a vector query on its own not keep retired answers out of the results?
answer: Because embeddings encode meaning, not status; a retired answer is as similar to the question as its replacement. Only a filter on the status and date fields excludes it.
explanation: >-
  Governance is metadata, enforced by filters, whatever the retrieval mode.
```

## Hands-on

Implement in `index.ts` (offline):

- `dot`, `norm`, `normalize`, `cosine` and `euclidean`, refusing vectors of different lengths and zero vectors where the result is undefined.
- `assertCompatible(query, stored)`: throw when the model or the dimensions differ.
- `rank(query, items, metric, k)`: exhaustive nearest neighbours, best first, with Euclidean scores negated so that higher is always better.

`embedders.ts` provides toy models that hash words into 64 or 128 dimensions with a seed. They capture word overlap, not meaning, but they show the property that matters: two models put the same text in unrelated places.

## Recap and next

You can compute and choose a similarity metric, explain why normalised vectors make cosine and dot product equivalent, and enforce the rule that query and index share a model and dimensions. **Next:** step 27 puts vectors in the index: vector fields, HNSW parameters and profiles, and a live load of real embeddings.

## Further reading

- [Relevance in vector search (similarity metrics)](https://learn.microsoft.com/en-us/azure/search/vector-search-ranking)
- [Understand embeddings in Azure OpenAI](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/understand-embeddings)
- [Generate embeddings for search queries and documents](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-generate-embeddings)
- [Migrate embedding models](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-migrate-embedding-models)
