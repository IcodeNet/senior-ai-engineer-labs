# 19 · Load the index with the push API

*Module 3 · Provision and load (live) · step 3 of 7 · Track: TypeScript*

> **Cost notice.** The live test writes to the billable search service that **Set up Azure** creates (lesson 17). Without it the test is skipped and the offline tests still check your code.

## Concept

There are two ways to get content into an index. **Push**: your code sends JSON documents to `POST /indexes/<name>/docs/index`. **Pull**: an indexer fetches from a data source on a schedule (steps 20–21). Push works with any source, gives you full control of timing and shape, and makes every failure your code's problem.

```json
{ "value": [
  { "@search.action": "mergeOrUpload", "id": "aHR0cHM6Ly9zdXBwb3J0…", "title": "Overdraft fees", "chunk": "…", "status": "approved", … },
  { "@search.action": "delete", "id": "aHR0cHM6Ly9zdXBwb3J0…" }
] }
```

Why a senior engineer cares: "the overnight load succeeded" while 3% of documents are missing is a classic incident. It comes from treating HTTP 207 as success, from retrying the wrong failures, or from sending two actions for one key in one request.

## Theory

**The four actions.**

| Action | Effect | Use it for |
|---|---|---|
| `upload` | insert, or replace the whole document; fields you omit become `null` | full reloads from a source of truth |
| `merge` | update the named fields of an existing document; fails with 404 if it does not exist | partial updates, such as retiring an answer |
| `mergeOrUpload` | `merge` if it exists, `upload` if not | incremental loads (the most common) |
| `delete` | remove by key; other fields are ignored; idempotent (200 even if absent) | withdrawn content |

Merge overwrites a field's value whole. A `Collection(Edm.String)` of `["budget"]` merged with `["economy", "pool"]` becomes `["economy", "pool"]`, not three values. To clear a field, merge it to `null`. Deleted documents are removed physically by a background process, so counts lag for a few minutes.

**Keys.** Every action is identified by the case-sensitive key field. The Northbank key is a stable encoding of `sourceUri#chunkIndex` (step 11), so reloading a source overwrites its chunks instead of duplicating them. A key identifies a record; it does not authorise a writer.

**Batching.** One request may carry up to **1,000 documents or about 16 MB**, whichever comes first; over that, the service answers 413. Batching improves throughput a lot, but bigger is not always faster: Microsoft's guidance is to test batch sizes against your documents. There is **no ordering guarantee** within a request, and Microsoft advises against several merges for one document in one request, so a robust batcher starts a new request when a key repeats.

**Responses.** 200 means every document was accepted. **207 Multi-Status** means at least one failed: check each item's `status` and `statusCode`. Accepted documents become searchable a few seconds later.

| Item status | Meaning | Retry? |
|---|---|---|
| 200, 201 | modified or deleted; created | – |
| 400 | the document is invalid (wrong type, bad date) | no: fix the data |
| 404 | merge of a key that does not exist | no: use `mergeOrUpload`, or investigate |
| 409 | version conflict from concurrent writes to one document | yes, after a delay |
| 422 | index temporarily unavailable (updated with `allowIndexDowntime`) | yes, after a delay |
| 503 | service busy | yes, with backoff, and throttle: frequent 503s escalate to rejected requests |
| 429 | quota, usually storage nearly full | not blindly: free space or add capacity |

**Retries.** Resend only the retryable documents, with exponential backoff, a cap, and a report of whatever is left. Retrying 400s wastes requests and hides data bugs. Retrying 503s immediately prolongs the overload you are reacting to.

**When not to push.** If the data lives in a supported source (Blob, SQL, Cosmos DB…) and needs change tracking, scheduling or AI enrichment, an indexer (next step) does it for you. Push is right when the source is unsupported, when you need sub-second freshness, or when your own pipeline already prepares the documents, as Northbank's does.

## Check questions

```question
prompt: An answer is withdrawn. Which action removes its chunks, and what must each action contain?
options:
  - upload with status retired and every field
  - delete with just the document key
  - merge with all fields set to null
answer: delete with just the document key
explanation: >-
  Delete identifies the document by key and ignores any other field. It is idempotent, so retrying it is safe. Setting
  status to retired with a merge is the alternative when you want to keep the record for audit and filter it out.
source: handoff
```

```question
prompt: A nightly push returns HTTP 207 for 3 of 40 requests. The job logs "success". What went wrong, and what should it do?
answer: 207 means some documents in those requests failed. The job must read each item's status, retry only retryable codes (409, 422, 503) with backoff, and report the rest, such as 400s, as failures.
explanation: >-
  Treating the HTTP status of the request as the status of every document silently loses data. Per-document results
  are the source of truth.
```

```question
prompt: You merge tags ["economy", "pool"] into a document whose tags were ["budget"]. What are its tags afterwards?
options:
  - "[\"budget\", \"economy\", \"pool\"]"
  - "[\"economy\", \"pool\"]"
  - "[\"budget\"], because merge never overwrites"
answer: >-
  ["economy", "pool"]
explanation: >-
  Merge overwrites each named field's value whole, including collections. To add a value you must send the full new
  collection.
```

```question
prompt: Why should a batcher never put two actions for the same key in one request?
answer: The service does not guarantee the order of actions inside a request, so a merge and a later delete, or two merges, can apply in either order.
explanation: >-
  Combine changes to one document client-side, or split them across requests in order. The batcher in this step starts
  a new request when a key repeats.
```

## Hands-on

Implement in `index.ts`:

- `deleteActions(keys)` and `mergeAction(id, fields)`.
- `batches(actions, limits)`: split in order within `maxDocs` and `maxBytes` (the byte size of the JSON body `{ "value": [...] }`); start a new request when a key repeats; throw `PayloadTooLargeError` for one document over the limit.
- `indexBatch(http, endpoint, index, actions)`: POST `{ value }`; 200 or 207 return `body.value`; 413 throws `PayloadTooLargeError`; anything else throws `indexing failed: <status> <message>`.
- `pushAll(http, endpoint, index, actions, options)`: send every batch, count successes, resend `RETRYABLE` documents after `sleep(baseDelayMs × 2^attempt)` up to `retries`, split a 413 request in half, and return `{ succeeded, failed, requests }`.

With Azure set up, the live test loads all of `NORTHBANK_DOCUMENTS` (including the draft and retired answers: keeping them out of answers is the filter's job), merges one title, and reads the document back.

## Recap and next

You can load an index the way production code must: batched within the limits, one action per key per request, 207 read per document, retries only where they help. **Next:** step 20 builds the pull pipeline: a Blob data source and an indexer that parses a JSON array file into one search document per element.

## Further reading

- [Load data into a search index](https://learn.microsoft.com/en-us/azure/search/search-how-to-load-search-index)
- [Update or rebuild an index: update content and status codes](https://learn.microsoft.com/en-us/azure/search/search-howto-reindex#update-content)
- [Documents - Index (REST)](https://learn.microsoft.com/en-us/rest/api/searchservice/documents)
- [Tutorial: optimise indexing with the push API](https://learn.microsoft.com/en-us/azure/search/tutorial-optimize-indexing-push-api)
