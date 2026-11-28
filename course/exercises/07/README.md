# 07 · BM25 ranking, by hand and in code

*Module 1 · Search foundations · step 3 of 3 · Track: TypeScript*

## Concept

The inverted index tells you *which* documents match. **BM25** decides their **order**. It is the default relevance algorithm for full-text search in Azure AI Search, and the lexical half of the hybrid search you build in Module 5.

For each distinct query term `t` in a document `d`:

```text
idf(t)      = ln(1 + (N − df + 0.5) / (df + 0.5))
weight(t,d) = idf(t) × tf × (k1 + 1) / (tf + k1 × (1 − b + b × len(d) / avgLen))
score(d)    = Σ weight(t,d) over the query's distinct terms
```

Why a senior engineer cares: when a stakeholder asks "why is this answer first?", you can explain it from three levers, rare terms, repetition and length, instead of shrugging at a number.

## Theory

**The three levers.**

- **IDF**: a term in few documents tells you more than one in many. The `+1` inside the log keeps it positive even for a term in every document.
- **Term-frequency saturation (`k1`)**: the second mention adds less than the first, the tenth almost nothing. Azure's default is `k1 = 1.2`; `0` makes tf irrelevant.
- **Length normalisation (`b`)**: a match in a short chunk counts for more than the same match in a long one. Azure's default is `b = 0.75`; `0` turns it off, `1` normalises fully.

Azure lets you set `k1` and `b` on an index's `similarity` (`#Microsoft.Azure.Search.BM25Similarity`). Changing it on a live index needs `allowIndexDowntime=true`.

**A hand-worked example.** Three documents, analyzed with the standard analyzer, so `N = 3` and `avgLen = (2 + 3 + 4) / 3 = 3`:

| id | text | len |
|---|---|---|
| d1 | card refund | 2 |
| d2 | refund refund delay | 3 |
| d3 | card freeze app now | 4 |

Query: `card refund`. Both terms appear in two documents, so `idf = ln(1 + 1.5 / 2.5) = ln 1.6 ≈ 0.470004`.

- d1, `card` and `refund`, tf 1, len 2: norm = `1 − 0.75 + 0.75 × 2/3 = 0.75`; weight = `0.470004 × 2.2 / (1 + 1.2 × 0.75) = 0.470004 × 2.2 / 1.9 ≈ 0.544215` each, so **score ≈ 1.088430**.
- d2, `refund`, tf 2, len 3: norm = `1`; weight = `0.470004 × 4.4 / 3.2 ≈ 0.646255`.
- d3, `card`, tf 1, len 4: norm = `1.25`; weight = `0.470004 × 2.2 / 2.5 ≈ 0.413604`.

Ranking: **d1, d2, d3**. d1 wins by matching both terms; d2 repeats one term but saturation limits what repetition buys; d3 is penalised for length. Your tests check these numbers.

**Do not compare raw scores.** Implementations differ in constant factors and statistics, so do not expect your numbers to equal Azure's `@search.score`. Microsoft documents that the range is unbounded, that statistics are computed per shard by default (`scoringStatistics: "global"` changes that, at a performance cost) and per replica, and that you should treat a score as relative within one response, never as a fixed threshold across queries, users or filters.

**Filters do not change the statistics.** Document frequency and average length include documents that a filter excludes. Drafts and other tenants' documents therefore still influence the scores of what a user sees, even though they can never be returned. Ordering stays meaningful, but if scores must reflect only one tenant's content, Microsoft's advice is a separate index.

**Not everything is scored.** Filter-only queries, wildcard, regex and fuzzy queries return a uniform `@search.score` of 1. Ties have no stable order unless you add an `$orderby` tie-breaker.

**Where BM25 fails.** It matches tokens, so it misses paraphrases ("money back" vs "refund"). It shines on exact identifiers, error codes and names, which embeddings tend to blur. That complementarity is why hybrid search (Module 5) fuses BM25 with vector results.

**Repeated query terms.** This lab scores distinct query terms. Real query parsers can treat a repeated term as two clauses; keep your test queries free of accidental repeats.

## Check questions

```question
prompt: Two chunks contain "overdraft" once. One has 20 tokens, the other 200. With default settings, which scores higher for "overdraft", and which parameter decides it?
options:
  - The 200-token chunk, because k1 rewards longer text
  - The 20-token chunk, because b normalises term frequency by length
  - They score the same, because tf is equal
answer: The 20-token chunk, because b normalises term frequency by length
explanation: >-
  With b = 0.75 a document longer than average has its term frequency discounted. The same single mention means more
  in a short, focused chunk, which is one reason chunk size (Module 4) affects lexical ranking.
```

```question
prompt: Users search for the error code "ERR-4021" and a vector-only system returns unrelated errors. What would you change and why?
answer: Add lexical BM25 retrieval (hybrid search), because exact rare tokens get a high IDF in BM25 while embeddings can place different error codes close together.
explanation: >-
  Rare identifiers are BM25's strength and a known weakness of embeddings. Hybrid retrieval keeps both signals.
  Also check the analyzer: the standard tokenizer splits the code into "err" and "4021".
```

```question
prompt: A product owner wants to hide results whose BM25 score is below 2.0. What is wrong with that?
answer: BM25 scores are relative to the query, the corpus statistics and even the shard, so a fixed threshold means different things for different queries.
explanation: >-
  Scores order one result set; they are not calibrated probabilities. Short queries score lower than long ones, and
  statistics change as the index grows. Use top-k, filters, a reranker, or an evaluated relevance threshold instead.
```

```question
prompt: Draft answers are excluded by a filter. Can they still affect the BM25 scores of the approved answers a user sees?
answer: Yes. Filters limit what is returned, but document frequency and average length are computed over all documents in the shard, including filtered-out ones.
explanation: >-
  Microsoft documents that $filter expressions and document-level permissions do not change scoring statistics. The
  draft can never be returned, so governance holds, but it shifts idf. Treat scores as relative within a response,
  and use a separate index when statistics must reflect only one tenant's content.
```

```question
prompt: Is semantic ranking in Azure AI Search the same thing as BM25 with different parameters?
answer: No. Semantic ranking is a separate reranking stage, using language models, over an initial candidate set returned by BM25 or hybrid retrieval.
explanation: >-
  BM25 is first-stage lexical scoring. The semantic ranker reorders the top results from that first stage and can
  add captions and answers. It is also not vector search. Module 5 covers all three and how they combine.
source: handoff
```

## Hands-on

`inverted.ts` contains your working step 06. Implement in `index.ts`:

- `idf(N, df)`: the formula above; throw when `df` is outside `0..N`.
- `termWeight(tf, len, avgLen, idf, k1 = 1.2, b = 0.75)`: one term's contribution; `0` when `tf` is 0.
- `bm25(index, query, analyzer, { k1, b, top = 5 })`: sum the weights over the query's distinct analyzed terms, drop zero scores, sort by score then id.
- `explain(index, query, id, analyzer)`: per-term `tf`, `df`, `idf` and `weight` for one document. It is the same question an "explain this ranking" review asks.

## Recap and next

You implemented BM25 and checked it against numbers worked out by hand. You can explain rank order from IDF, saturation and length normalisation, and you know why raw scores are not thresholds. That completes the search foundations. **Next:** Module 2 designs a real Azure AI Search index, starting with field attributes.

## Further reading

- [Relevance in keyword search (BM25 scoring)](https://learn.microsoft.com/en-us/azure/search/index-similarity-and-scoring)
- [Configure BM25 relevance scoring](https://learn.microsoft.com/en-us/azure/search/index-ranking-similarity)
- [Semantic ranking in Azure AI Search](https://learn.microsoft.com/en-us/azure/search/semantic-search-overview)
- [Hybrid search](https://learn.microsoft.com/en-us/azure/search/hybrid-search-overview)
