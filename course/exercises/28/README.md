# 28 · Integrated vectorization: chunk and embed in the service

*Module 4 · Chunking and embeddings · step 4 of 4 · Track: TypeScript*

> **Cost notice.** The live test runs an indexer that calls the Azure OpenAI embedding deployment for about ten chunks, and queries the billable search service that **Set up Azure** creates (lesson 17). Without Azure it is skipped and the offline tests still check your code. When you finish, shut down and verify (end of this lesson).

## Concept

Steps 25–27 chunked and embedded in your own code, then pushed vectors. **Integrated vectorization** moves both into the search service: the indexer's skillset splits each document and calls the embedding model; **index projections** turn every chunk into its own search document; and a **vectorizer** on the index embeds text queries with the same model at query time.

```text
guides/northbank-guides.json ─► indexer (jsonArray: one guide per element)
                                 └─ skillset
                                    ├─ Text Split  /document/body → /document/pages/*   (600 chars, 150 overlap)
                                    ├─ Azure OpenAI Embedding  /document/pages/* → /document/pages/*/vector
                                    └─ index projections: one document per page in northbank-guides-vec-v1
                                         chunk, chunkVector, + title, sourceUri, status, effectiveDate, expiryDate from the guide
query: { "vectorQueries": [ { "kind": "text", "text": "…", "fields": "chunkVector", "k": 3 } ], "filter": "<governance>" }
                                 └─ vectorizer (same deployment, same model) embeds the text in the service
```

Why a senior engineer cares: one configuration does the work of a chunking job, an embedding job, retry logic and a query-side embedding call, and it keeps indexing-time and query-time embeddings consistent, as long as the skill and the vectorizer really are the same model.

## Theory

**Text Split skill.** `textSplitMode: "pages"` with `maximumPageLength` (300–50,000 characters, default 5,000) and `pageOverlapLength` (less than half the page length). It avoids breaking sentences, so pages are a little shorter than the maximum. It is free and not bound to Azure AI services billing. Token-based units exist in preview.

**Azure OpenAI Embedding skill.** `#Microsoft.Skills.Text.AzureOpenAIEmbeddingSkill` with `resourceUri`, `deploymentId`, `modelName` (`text-embedding-ada-002`, `text-embedding-3-small` or `-large`) and optional `dimensions`, which must equal the vector field's. Input is limited to 8,000 tokens. With no `apiKey` and no `authIdentity`, the service's **system-assigned identity** calls the model; it needs **Cognitive Services OpenAI User** on the Azure OpenAI resource (set-up grants it). Tokens are billed at the Azure OpenAI price. Point `resourceUri` only at resources you own: the service sends a managed identity token there.

**Index projections.** A skillset's `indexProjections.selectors` maps each element of `sourceContext` (`/document/pages/*`) to a document in `targetIndexName`. You map **every** field explicitly, including the parent's governance fields, so filters work on every chunk; you do **not** map the key (the indexer generates it; the key field needs the `keyword` analyzer) or the parent key field (`parent_id`, a filterable string), because that would break change tracking. `projectionMode: "skipIndexingParentDocuments"` keeps whole-guide documents with empty chunk fields out of the index.

**Vectorizer.** `vectorSearch.vectorizers` declares an `azureOpenAI` vectorizer (`resourceUri`, `deploymentId`, `modelName`); a profile references it; the vector field references the profile. A query with `"kind": "text"` is embedded by the service. The vectorizer must match the embedding skill's model, or queries and chunks live in different spaces (step 26). Microsoft suggests separate deployments for indexing and querying in production, to separate their rate limits; the course shares one.

**Operations.** Built-in retries handle embedding throttling (429) within limits; Microsoft recommends scheduling the indexer (for example every five minutes) so throttled documents are picked up later. Changes in the source flow through to the chunks; a shortened document deletes its extra chunks. Changing the model is a migration: a new field or index and a full re-run.

**When not to use it.** When you need a chunker or model the skills do not offer, or full control of batching and retries, keep your own pipeline (steps 25–27) and push. Many teams mix: integrated vectorization for the bulk of content, push for special cases.

## Check questions

```question
prompt: The embedding skill uses text-embedding-3-small at 1,536 dimensions, but the vectorizer names text-embedding-3-large. What goes wrong?
answer: Text queries are embedded by a different model than the chunks, so similarity scores compare unrelated spaces (and the dimensions differ), and results are meaningless or the query fails.
explanation: >-
  Integrated vectorization only stays consistent if the skill and the vectorizer use the same model, dimensions and
  ideally the same resource. The course's review checks all of them.
```

```question
prompt: Why does each projected chunk map status, effectiveDate and expiryDate from its parent guide?
answer: Because filters run on the chunk documents; a chunk without the governance fields could not be filtered and would either be excluded always or, worse, slip past a filter designed differently.
explanation: >-
  Index projections create new documents. Anything a query needs, including governance and citations, must be mapped
  onto every chunk.
```

```question
prompt: What does projectionMode skipIndexingParentDocuments prevent?
options:
  - It prevents the indexer from reading parent blobs
  - It prevents parent documents with empty chunk fields from being indexed alongside the chunks
  - It prevents the embedding skill from running on the parent
answer: It prevents parent documents with empty chunk fields from being indexed alongside the chunks
explanation: >-
  The default, includeIndexingParentDocuments, adds one extra document per source with null chunk and vector fields,
  which pollutes results and counts. For chunk-centred RAG indexes, skip them.
```

```question
prompt: The embedding skill has no apiKey. How does it authenticate, and what must exist for that to work?
answer: With the search service's system-assigned managed identity, which needs the Cognitive Services OpenAI User role on the Azure OpenAI resource.
explanation: >-
  Keyless calls from the service mirror the keyless calls you make with az. The role assignment is in azure/main.bicep;
  without it, the indexer fails with an authorisation error per chunk.
```

## Hands-on

Implement in `index.ts`:

- `vectorIndex(env)`: the chunk index (`chunk_id` key with the keyword analyzer, `parent_id`, text, citation and governance fields, `chunkVector`) with an HNSW profile and a keyless `azureOpenAI` vectorizer.
- `vectorSkillset(env, maximumPageLength, pageOverlapLength)`: Text Split, then Azure OpenAI Embedding on each page, then index projections with every field mapped and parent documents skipped.
- `vectorIndexerDefinition()` and `guideRecords(documents)`.
- `reviewIntegratedVectorization(index, skillset)`: one problem per rule broken: `split`, `context`, `model`, `deployment`, `resource`, `keyless`, `dimensions`, `key` and `projection`.
- `textVectorQuery(text, k, asOf)`: a governed `kind: "text"` vector query.

`pipeline.ts` (step 20) provides the upload, data source and indexer helpers; the guides go to the `guides/` folder with their own data source. With Azure set up, the live test uploads the guides, runs the pipeline and checks that "Am I charged when a payment would take me past my limit?" finds the overdraft guide.

### Shut down

Module 5 uses Azure again; if you are pausing, shut down now. Run **Shut down Azure**, then **Verify cost is zero** (Actions tab, group **Module 3 · Azure**; lesson 23 explains every step and what to do if Verify finds leftovers). Shutdown deletes this step's index, data source, skillset and indexer with the search service, and the guides blob with the storage account.

## Recap and next

Module 4 is complete: you can choose and measure a chunking strategy, compute and choose similarity metrics, configure vector fields and HNSW and measure their recall, and run integrated vectorization end to end with a consistent model at indexing and query time. **Next:** Module 5 compares retrieval modes on the same labelled questions: vector, hybrid with Reciprocal Rank Fusion, and the semantic ranker.

## Further reading

- [Integrated vectorization](https://learn.microsoft.com/en-us/azure/search/vector-search-integrated-vectorization)
- [Text Split skill](https://learn.microsoft.com/en-us/azure/search/cognitive-search-skill-textsplit)
- [Azure OpenAI Embedding skill](https://learn.microsoft.com/en-us/azure/search/cognitive-search-skill-azure-openai-embedding)
- [Define an index projection for parent-child indexing](https://learn.microsoft.com/en-us/azure/search/search-how-to-define-index-projections)
- [Azure OpenAI vectorizer](https://learn.microsoft.com/en-us/azure/search/vector-search-vectorizer-azure-open-ai)
- [Configure a vectorizer](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-configure-vectorizer)
