# 27 · Vector fields, HNSW and profiles

*Module 4 · Chunking and embeddings · step 3 of 4 · Track: TypeScript*

> **Cost notice.** The live test embeds 12 chunks with the Azure OpenAI deployment and queries the billable search service that **Set up Azure** creates (lesson 17): a fraction of a cent of tokens. Without Azure it is skipped and the offline tests still check your code.

## Concept

Step 26 ranked vectors by comparing the query with every one of them. That is exact and fine for 12 chunks; at millions it is too slow. Azure AI Search stores vectors in **vector fields** and searches them with an **algorithm** chosen through a **profile**: usually **HNSW**, an approximate nearest-neighbour graph.

```json
"fields": [ { "name": "contentVector", "type": "Collection(Edm.Single)", "searchable": true, "retrievable": false,
              "dimensions": 1536, "vectorSearchProfile": "northbank-vector-profile" } ],
"vectorSearch": {
  "algorithms": [ { "name": "northbank-hnsw",  "kind": "hnsw", "hnswParameters": { "m": 4, "efConstruction": 400, "efSearch": 500, "metric": "cosine" } },
                  { "name": "northbank-exact", "kind": "exhaustiveKnn", "exhaustiveKnnParameters": { "metric": "cosine" } } ],
  "profiles":   [ { "name": "northbank-vector-profile", "algorithm": "northbank-hnsw" },
                  { "name": "northbank-exact-profile",  "algorithm": "northbank-exact" } ]
}
```

Why a senior engineer cares: the vector configuration fixes memory use, indexing speed, query latency and recall, and most of it cannot be changed on an existing field.

## Theory

**Vector fields.** Type `Collection(Edm.Single)` (narrower types such as `Edm.Half` save space), `dimensions` equal to the embedding model's output (1–4,096), `searchable: true`, never filterable, sortable or facetable, and no analyzers. `retrievable` decides whether raw vectors come back in results: almost never useful, so it is off. A field is linked to its configuration only through `vectorSearchProfile`.

**Algorithms, profiles and vectorizers.** `vectorSearch.algorithms` holds `hnsw` or `exhaustiveKnn` configurations; `profiles` combine an algorithm with an optional **compression** (scalar or binary quantisation) and an optional **vectorizer** (step 28); fields reference profiles. Names are unique per kind. This layering lets one index hold several vector fields with different trade-offs.

**HNSW parameters.**

| Parameter | Meaning | Range (default) | Higher means |
|---|---|---|---|
| `m` | bi-directional links per node | 4–10 (4) | better recall, more memory, slower indexing |
| `efConstruction` | candidate list size while building | 100–1,000 (400) | better graph, slower indexing |
| `efSearch` | candidate list size while querying | 100–1,000 (500) | better recall, slower queries |
| `metric` | `cosine`, `dotProduct`, `euclidean`, `hamming` | (cosine) | must match the embedding model; Azure OpenAI uses cosine |

HNSW's memory overhead is between about 1% and 20% of the raw vectors (number of vectors × dimensions × 4 bytes for `Edm.Single`), growing with `m`. The vector index has its own quota per service (the `vectorIndexSize` counter from step 17).

**Approximate versus exact.** HNSW may miss some true nearest neighbours. **Exhaustive KNN** compares the query with every vector: exact and slow. Keep an exhaustive profile, or set `exhaustive: true` on a vector query, to measure HNSW's **recall@k** against the truth on your own data before tuning anything.

**What can change.** Adding vector fields and new configurations for them is an in-place update; changing `dimensions` or an existing vector field's profile is a rebuild (step 18). Changing embedding model means re-embedding every chunk.

**Filters still apply.** A vector query is just another query: the governance filter goes with it. By default filters are applied before the vector search on new indexes (`vectorFilterMode` `preFilter`), so the k results are k approved ones.

## Check questions

```question
prompt: Queries miss relevant chunks that exhaustive KNN finds. Which HNSW parameter do you raise first, and what does it cost?
options:
  - efSearch, at the cost of query latency, with no reindexing needed
  - m, at the cost of nothing, because it only affects queries
  - dimensions, to give the vectors more room
answer: efSearch, at the cost of query latency, with no reindexing needed
explanation: >-
  efSearch widens the candidate list at query time. m and efConstruction change the graph itself (more memory, slower
  indexing). dimensions belong to the embedding model and cannot simply be raised.
```

```question
prompt: Why does the course keep an exhaustiveKnn profile next to HNSW?
answer: To compute the exact nearest neighbours on the same data, so HNSW's recall@k can be measured instead of assumed.
explanation: >-
  ANN trades recall for speed. Without an exact baseline you cannot tell whether a missed chunk is a ranking problem,
  a chunking problem or approximation error.
```

```question
prompt: Which attributes can a vector field have?
answer: It must be searchable, needs dimensions and a vectorSearchProfile, may be retrievable, and cannot be filterable, sortable or facetable or have an analyzer.
explanation: >-
  Vectors are searched by similarity only. Filtering, sorting and faceting work on the non-vector fields of the same
  document, which is why the Northbank chunk keeps status and dates beside its vector.
```

```question
prompt: The embedding model outputs 1,536 dimensions but the field declares 3,072. What happens when you load vectors?
answer: Documents whose vectors do not match the field's dimensions are rejected; the declared dimensions must equal the model's output exactly.
explanation: >-
  The field's dimensions are fixed at creation. Mismatches fail at indexing, which is the good case: a same-length
  vector from the wrong model would load and silently return nonsense.
```

## Hands-on

Implement in `index.ts`:

- `hnswAlgorithm(name, parameters)` with the documented defaults and ranges, and `vectorField(name, dimensions, profile)`.
- `northbankVectorIndex(dimensions)`: the Northbank index with the configuration above (an in-place update of step 18's index).
- `validateVectorIndex(index)`: duplicate names, HNSW ranges and kinds, profile references to algorithms, vectorizers and compressions, and vector field attributes, dimensions and profiles.
- `recallAtK(approximate, exact, k)`.
- `embedTexts(http, env, texts, batchSize)`: `POST <openai endpoint>openai/v1/embeddings` with `{ model: <deployment>, input }`, audience `openai`; restore order by `index`; check counts and dimensions.
- `vectorMergeActions(documents, vectors)`, `vectorQuery(vector, k, asOf, exhaustive)` and `searchVectors(http, endpoint, index, request)`.

With Azure set up, the live test updates the index, loads the chunks, embeds them, merges the vectors, and checks that "Am I charged if a payment would take me over my overdraft limit?" finds the overdraft answer, with HNSW matching exhaustive KNN.

## Recap and next

You can configure vector fields, algorithms and profiles, reason about HNSW's parameters, measure approximate recall against an exact baseline, and load real embeddings safely. **Next:** step 28 lets the service do the chunking and embedding itself: integrated vectorization with a skillset, index projections and a query-time vectorizer.

## Further reading

- [Create a vector index (algorithms, profiles, HNSW parameters)](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-create-index)
- [Vector indexes and field attributes](https://learn.microsoft.com/en-us/azure/search/vector-store)
- [Vector index size and limits](https://learn.microsoft.com/en-us/azure/search/vector-search-index-size)
- [Relevance in vector search (HNSW, exhaustive KNN)](https://learn.microsoft.com/en-us/azure/search/vector-search-ranking)
- [Create a vector query (exhaustive, filters)](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-query)
