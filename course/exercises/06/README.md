# 06 · Tokenizers, analyzers and the inverted index

*Module 1 · Search foundations · step 2 of 3 · Track: TypeScript*

## Concept

Full-text search does not scan documents. At indexing time it **analyzes** each searchable field into terms and builds an **inverted index**: for every term, the list of documents (postings) that contain it, with how often and where. A query is analyzed the same way and answered by looking terms up.

```text
"Freeze your card in the app"
   │ tokenizer      Freeze | your | card | in | the | app
   │ token filters  lower-case, (optional) stopwords
   ▼
 card ──► [faq-card-lost: tf 1, positions [2]]
 app  ──► [faq-card-lost: tf 1, positions [5]]
```

Why a senior engineer cares: "search didn't find it" is almost always an analysis question. The query term and the indexed term were not the same string. Knowing the pipeline lets you debug that in minutes instead of guessing.

## Theory

**Analyzer = tokenizer + token filters** (plus optional character filters before tokenizing). In Azure AI Search every searchable string field has an analyzer; if you specify none, it uses the **standard Lucene analyzer**: the standard tokenizer, a lower-case filter and a stop filter whose **stopword list is empty by default**. Microsoft also offers language analyzers (Lucene and Microsoft natural-language ones, which add stemming or lemmatisation) and custom analyzers.

**Tokenizers decide what a word is.** The standard tokenizer follows Unicode text segmentation, so `ERR-4021` becomes `err` and `4021`, while `northbank's` and `39.9` stay whole. If your users search for product codes with hyphens, the standard analyzer has already split them. That needs a different analyzer, or a separate field with a keyword-style analyzer.

**Same analyzer for indexing and querying**, unless you have a deliberate reason (`indexAnalyzer`/`searchAnalyzer`). If the query is lower-cased and the index is not, nothing matches. Microsoft recommends inspecting tokens with the **Analyze API** when results surprise you. Changing a field's analyzer requires rebuilding the index, so decide during development.

**Postings carry what ranking needs:** document frequency (how many postings a term has), term frequency per document, and **positions**. Positions make phrase queries possible. When a stopword is removed, the remaining tokens keep their original positions, so `"freeze the card"` cannot match "freeze card".

**`searchMode` maps to set operations.** With the default `searchMode=any`, a query for two terms matches documents containing either: a union of postings. With `searchMode=all`, every term must match: an intersection. `any` favours recall; `all` favours precision.

**Partial terms bypass analysis.** Prefix, wildcard, fuzzy and regex terms in a query are not analyzed; Azure only lower-cases them. A stemmed index can therefore miss a wildcard you expected to match. Step 12 returns to this.

**Filterable is not searchable.** A filterable string field is stored verbatim, not word-broken. `$filter=title eq 'card'` does not match "Lost card". Filters are exact; search is analyzed.

## Check questions

```question
prompt: A Northbank field uses the default analyzer. Is "the" removed from indexed text?
options:
  - Yes, the standard analyzer removes English stopwords
  - No, the standard analyzer's stop filter has an empty stopword list unless you configure one
  - Only in queries, not in documents
answer: No, the standard analyzer's stop filter has an empty stopword list unless you configure one
explanation: >-
  The standard Lucene analyzer is the standard tokenizer, a lower-case filter and a stop filter, but its stopwords
  default to an empty list. The separate "stop" analyzer and language analyzers do use stopword lists. Assuming
  stopwords are dropped leads to wrong expectations about phrase matching and scores.
```

```question
prompt: Users search for "ERR-4021" and get results for every error that mentions 4021. Why?
answer: The standard tokenizer splits on the hyphen, so the query becomes "err" OR "4021" and matches any document with either term.
explanation: >-
  With searchMode=any, the two tokens are alternatives. Fixes include searchMode=all, a phrase query, or indexing the
  code in a separate field with an analyzer that keeps it as one token. Check with the Analyze API rather than guessing.
```

```question
prompt: Which part of the inverted index makes the phrase query "lost card" possible?
answer: The positions stored in each posting.
explanation: >-
  Term frequency and document frequency are enough for ranking single terms, but a phrase needs the terms to be
  adjacent and in order. Positions let the engine check that "card" appears at the position after "lost".
```

```question
prompt: Your index uses an English analyzer with stemming, but your query uses a different analyzer with no stemming. What happens to "refunds"?
answer: The index may store "refund" while the query looks up "refunds", so the document is not found.
explanation: >-
  Index and query terms must be produced the same way. That is why Azure uses one analyzer for both unless you set
  indexAnalyzer and searchAnalyzer deliberately, and why you should test both with the Analyze API.
```

```question
prompt: Why does a filter on a string field need an exact value when full-text search does not?
answer: Filterable strings are stored verbatim and compared exactly; only searchable fields go through the analyzer.
explanation: >-
  Microsoft's example: given "sunny day", the filter f eq 'sunny' finds nothing and f eq 'sunny day' matches.
  Governance values such as status therefore need consistent, exact values, which step 11 enforces when documents are built.
```

## Hands-on

Implement in `index.ts`:

- `tokenize(text)`: runs of Unicode letters and digits, keeping an apostrophe between letters (`northbank's`) and a dot or comma between digits (`39.9`, `1,000`) inside the token. This is a simplified standard tokenizer.
- `analyze(text, analyzer)`: tokenize, lower-case if configured, remove stopwords (compared lower-cased) and keep each surviving token's **original** position.
- `buildIndex(docs, analyzer)`: postings per term sorted by document id, each with `tf` and `positions`; `docLength` counts the tokens kept; duplicate ids throw.
- `matchAny` and `matchAll`: analyze the query with the same analyzer, then take the union or intersection of postings. An empty query matches nothing.

The last test shows that `refunds` does not find `refund`: no stemming here, on purpose.

## Recap and next

Search quality starts with analysis: tokenizer, filters, and the same analyzer on both sides. The inverted index stores terms, frequencies and positions; `any` and `all` are union and intersection. **Next:** step 07 ranks those matches with BM25.

## Further reading

- [Analyzers for text processing](https://learn.microsoft.com/en-us/azure/search/search-analyzers)
- [Add custom analyzers (built-in analyzers and token filters)](https://learn.microsoft.com/en-us/azure/search/index-add-custom-analyzers)
- [Full-text search in Azure AI Search (query parsing, lexical analysis, inverted index)](https://learn.microsoft.com/en-us/azure/search/search-lucene-query-architecture)
- [Analyze Text (REST API)](https://learn.microsoft.com/en-us/rest/api/searchservice/indexes/analyze)
