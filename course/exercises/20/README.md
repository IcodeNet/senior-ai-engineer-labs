# 20 · Pull from Blob storage with an indexer

*Module 3 · Provision and load (live) · step 4 of 7 · Track: TypeScript*

> **Cost notice.** The live test uploads a blob to the billable storage account and runs an indexer on the search service that **Set up Azure** creates (lesson 17). Without them it is skipped and the offline tests still check your code.

## Concept

The pull model moves the loading loop into the service. You describe **where** the data is (a data source), **where** it goes (an index) and **how** to read it (an indexer); the search service fetches, parses, maps and indexes, on demand or on a schedule.

```text
Blob container "northbank-faq"               search service (managed identity)
└─ faq/northbank-faq.json  [ {…}, {…}, … ] ──►  data source ──► indexer (parsingMode: jsonArray) ──► index northbank-faq-pull-v1
                                             keyless:            one array element = one search document
                                             ResourceId=…;       key = the element's "id"
```

The shorthand to remember (a reconstructed study note): **the index stores, the indexer pulls, the skillset enriches.** A skillset is optional; step 21 adds one.

Why a senior engineer cares: indexers give you change detection, scheduling, retries and enrichment for free, but they also decide document identity, permissions and failure handling in ways that are easy to get wrong silently.

## Theory

**Data source.** A named connection: `type: "azureblob"`, a container (optionally narrowed to a virtual folder with `container.query`, here `faq/`), and credentials. With a **managed identity**, the connection string is just the storage account's resource ID, `ResourceId=/subscriptions/…/storageAccounts/<name>;`, with no key. The search service's system-assigned identity needs **Storage Blob Data Reader** on the account (set-up grants it). The connection and the role are validated when the indexer runs, not when the data source is created.

**Indexer stages.** Document cracking (open the blob and parse it), field mappings (source → index fields when names or types differ), optional skillset execution, output field mappings (enrichments → index fields), then indexing. Creating an indexer runs it once immediately; updating one does not. `POST /indexers/<name>/run` queues a run (202) and returns before anything is indexed, so you poll `GET /indexers/<name>/status`.

**Parsing modes for JSON.** By default a blob indexer extracts a blob as text into one document. `json` parses one JSON object per blob into fields. **`jsonArray`** makes each element of a top-level array its own document (`documentRoot` selects a nested array). `jsonLines` does the same for newline-separated objects. All blobs in the data source are assumed to use the same parser, so restrict the indexer to `.json` with `indexedFileNameExtensions`.

**Document keys from one blob to many documents.** A blob's default key is `metadata_storage_path`, which cannot be unique for many documents. For one-to-many modes the indexer generates an `AzureSearch_DocumentKey` (from the blob path and position, base64-encoded) and maps it to the key field, unless the elements carry a field named like the key. Northbank's elements carry their own stable `id`, so pushed and pulled documents share keys. The trade-off: an `id` that repeats across blobs **merges** into one document instead of creating two. Microsoft notes that the generated key's format may change; never parse it, and do not treat any key as an authorisation boundary.

**Nulls and deletions.** To overwrite a value, the source must provide a non-null value; a `null` leaves the existing value in place (send `""` to clear a string). Removing an element from an array does **not** delete its document: you delete it explicitly or rebuild. Whole-blob deletions are detected only with a deletion detection policy (for example native blob soft delete), which this course does not configure.

**Failure modes.** A 403 at run time is the managed identity's role not yet propagated or missing. A typo in a field mapping is skipped silently, so documents arrive with nulls. `itemsFailed` above zero with `maxFailedItems` raised can still be reported as `success`: check counts, not just status.

**When not to use an indexer.** Unsupported sources, sub-second freshness, or documents your own pipeline already shapes (step 19) are better pushed. Indexers shine for supported sources that change over time and for enrichment.

## Check questions

```question
prompt: What is the difference between an index, an indexer and a skillset?
answer: The index stores the searchable documents; the indexer pulls data from a source into the index; the skillset (optional) enriches documents during indexing.
explanation: >-
  Data source → indexer → (skillset) → index is the pull pipeline. Enrichment happens at indexing time, not on every
  query. Push loading (step 19) skips the indexer entirely.
source: handoff
```

```question
prompt: A blob holds a JSON array of 12 FAQ chunks. Which indexer setting makes each element a separate search document?
options:
  - parsingMode json
  - parsingMode jsonArray
  - parsingMode default with a field mapping per element
answer: parsingMode jsonArray
explanation: >-
  jsonArray treats each element of the top-level array (or of the array at documentRoot) as one document. json makes
  one document per blob, and default extracts the blob as text.
source: handoff
```

```question
prompt: Two blobs each contain an element with "id" "1". The key field is id. How many search documents result?
options:
  - Two, because each blob gets its own generated key
  - One, because the second element merges into the document with that key
  - None, because duplicate keys fail the indexer
answer: One, because the second element merges into the document with that key
explanation: >-
  When elements carry the key field, its value is the key, so equal values across blobs collide and merge. Use the
  generated key, or make your own key unique across all blobs.
```

```question
prompt: The data source's connection string is "ResourceId=/subscriptions/…/storageAccounts/stsaiel…;". Whose permissions does the indexer use to read the blobs?
answer: The search service's managed identity, which needs a role such as Storage Blob Data Reader on the storage account.
explanation: >-
  A ResourceId connection string carries no secret. The service authenticates as itself, so access is granted, audited
  and revoked through role assignments, and works with shared keys disabled on the account.
```

## Hands-on

Implement in `index.ts`:

- `pullIndex(dimensions)`: the Northbank schema named `northbank-faq-pull-v1`, plus `keyPhrases` and `language` for step 21. Adding them now avoids a later schema change.
- `toBlobRecords(documents)`, `blobUrl(env, name)` and `uploadBlob(http, env, name, records)`: Put Blob with audience `storage` and headers `x-ms-blob-type: BlockBlob`, `x-ms-version` and `content-type`; expect 201.
- `dataSourceDefinition(env, name, folder)`: keyless `azureblob` data source limited to a folder (default `faq/`); reject anything that is not a storage account resource ID.
- `indexerDefinition()`: `jsonArray`, `.json` only, into the pull index.
- `simulateJsonArray(blobs, keyField)`: a model of document cracking for jsonArray, to reason about keys offline: one document per element, the element's key or a generated stand-in, merges for repeated keys (non-null values win), and per-blob errors.
- `createOrUpdate`, `runIndexer` and `waitForIndexer(http, endpoint, name, { since, … })`: ignore a `lastResult` that started before `since`, wait while `inProgress`, return the counts on `success`, throw on failures, failed items or a timeout.

With Azure set up, the live test uploads `faq/northbank-faq.json` (12 elements), creates the index, data source and indexer, waits for the run, and counts the documents.

## Recap and next

You can load an index without a loading loop: a keyless data source, a `jsonArray` indexer, and a poll that tells success from "accepted". You know where keys come from in one-to-many parsing and why repeated ids merge. **Next:** step 21 attaches a skillset that detects language and extracts key phrases, and maps the enrichments into the index.

## Further reading

- [Index JSON blobs and files (parsing modes)](https://learn.microsoft.com/en-us/azure/search/search-howto-index-json-blobs)
- [Indexing blobs to produce multiple search documents (keys)](https://learn.microsoft.com/en-us/azure/search/search-how-to-index-azure-blob-one-to-many)
- [Index data from Azure Blob Storage](https://learn.microsoft.com/en-us/azure/search/search-how-to-index-azure-blob-storage)
- [Connect to Azure Storage using a managed identity](https://learn.microsoft.com/en-us/azure/search/search-howto-managed-identities-storage)
- [Put Blob (REST)](https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob) and [Authorize with Microsoft Entra ID](https://learn.microsoft.com/en-us/rest/api/storageservices/authorize-with-azure-active-directory)
