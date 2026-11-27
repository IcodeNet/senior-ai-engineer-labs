# 18 · Embed and index documents with Azure OpenAI

> **Cost notice.** The live tests in this step call real, billable Azure resources created by `npm run azure:up`. Azure AI Search Basic is charged for every hour it exists; Azure OpenAI is charged per token. When you finish the lab, run `npm run azure:down` and then `npm run azure:verify`. Without Azure set up, the live tests are skipped and the offline tests still check your code.

## Why it matters
Vector search needs every chunk embedded with the **same model** that will embed queries. Embedding APIs take batches, can return results out of order, and rate-limit with HTTP 429 — production code batches, restores order and checks the vector size before writing anything.

Uploading is subtler than it looks. Azure AI Search accepts a batch and may answer **207 Multi-Status**: the request succeeded, but individual documents failed. Treating that as success silently loses data. Document **keys** are restricted to letters, digits, `_`, `-` and `=`, so IDs like `travel@2#0` must be encoded reversibly.

Governance is computed at indexing time too: `isLatest` marks the highest **approved** version of each document so queries can exclude superseded and draft versions with a filter (re-index when a new version is approved).

## Interview question
> Overnight indexing "succeeded" but 3% of documents are missing from search. Where do you look first?

## Your task
Implement in `index.ts`:

- `documentKey(chunkId)` — base64url of the UTF-8 chunk ID.
- `embedTexts(http, env, texts, batchSize = 16)` — `POST` to `openai/v1/embeddings` on `env.openaiEndpoint` with `{ model: env.embeddingDeployment, input }`, audience `openai`; sort each batch's `data` by `index`; throw `embedding failed: <status> <message>`, `embedding returned <n> vectors for <m> inputs` or `embedding has <n> dimensions, index expects <d>`.
- `toIndexActions(chunks, vectors)` — one `mergeOrUpload` action per chunk with all fields, `id = documentKey(chunk.id)` and `isLatest`; throw `RangeError` unless there is one vector per chunk.
- `uploadDocuments(http, endpoint, index, actions)` — `POST .../indexes/{index}/docs/index`; accept 200 or 207; throw `indexing failed for <key>: <errorMessage>` for the first failed document; return the number indexed.

`indexing.ts` contains a working step 17; `corpus.ts` the synthetic policies used by the live test.

## Going further
Large corpora use indexers with change tracking, retry with backoff on 429/503, and store the embedding model name with each document so a model change triggers re-embedding.
