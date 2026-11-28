# 22 · Knowledge store: projections of the enrichment tree

*Module 3 · Provision and load (live) · step 6 of 7 · Track: TypeScript*

> **No Azure in this step.** The knowledge store is taught as theory with an offline model. Nothing here creates or writes Azure resources.

## Concept

Step 21's enrichments went into a search index through output field mappings. A **knowledge store** sends the same enrichment tree somewhere else: tables, JSON objects and image files in Azure Storage, for analytics, data science or downstream apps that are not search.

```text
enrichment tree                                   Azure Storage
/document/chunkShape ─┬─ table projection  ─────► Table northbankChunks       (one row per document)
                      ├─ table projection  ─────► Table northbankKeyPhrases   (/document/chunkShape/keyPhrases/*: one row per phrase)
                      └─ object projection ─────► container northbank-enriched (one JSON blob per document)
/document/normalized_images/* ── file projection ► container of image files
```

Why a senior engineer cares: it is the cheapest way to reuse paid enrichment outside search, and a common source of storage that nobody remembers to delete.

## Theory

**Not a search index, not a knowledge base.** A knowledge store is secondary storage written by an indexer's skillset. It is unrelated to the knowledge sources and knowledge bases used by agentic retrieval, despite the similar name, and nothing in it is queryable through the search APIs.

**Three projection types.**

| Projection | Lands in | Use it for |
|---|---|---|
| `tables` | Azure Table Storage | rows and columns: reporting, Power BI, data frames; several related tables |
| `objects` | Blob containers, one JSON document each | the full enriched document in one JSON object |
| `files` | Blob containers | normalised image files extracted during cracking (`/document/normalized_images/*`) |

**Sources are enrichment paths.** Every projection has a `source`, a path such as `/document/chunkShape` or `/document/chunkShape/keyPhrases/*` (the `*` projects each element). The source is a skill output, very often a **Shaper** skill (`#Microsoft.Skills.Util.ShaperSkill`) that gathers nodes into one shape, or an inline shape. Table projections need a shape for their columns; objects must be valid JSON objects.

**Projection groups.** `projections` is an array of groups. Within a group, projections are **related**: generated keys tie each table row and object back to its parent document. Groups are **isolated** from each other: each reads the same tree but shapes it independently, which is useful for trying two table designs side by side.

**Definition and permissions.** Projections are defined in the skillset's `knowledgeStore` property, next to its `storageConnectionString`; there are no indexer properties for them. With a managed identity, use a `ResourceId=…;` connection string and give the search identity **Storage Blob Data Contributor** for object and file projections, and **Reader and Data Access** for table projections. Note what the latter grants: it includes `listKeys` on the storage account, broader access than any other role in this course, so weigh it before adding table projections.

**Lifecycle.** Projections are refreshed as source data is reindexed, so they are eventually consistent with the source. They are **not deleted** when you delete the indexer, the skillset or even the search service: they are ordinary tables and blobs. In this course they would live in the course storage account and go with the resource group; in production they need an owner, a retention policy and a cost line. Enrichment caching (preview) lets you change projections without paying to rerun the skills.

**When not to use one.** If the enrichments only serve search, map them into the index. Add a knowledge store when a named consumer needs them outside search.

## Check questions

```question
prompt: Which projection type writes each enriched document as one JSON document in a Blob container?
options:
  - Table projection
  - Object projection
  - File projection
answer: Object projection
explanation: >-
  Object projections write JSON to Blob storage. Table projections write rows to Table storage; file projections write
  normalised image files to Blob storage.
source: handoff
```

```question
prompt: What does the source path /document/chunkShape/keyPhrases/* project in a table projection?
answer: One row per key phrase in each document's chunkShape node, related to the document by a generated key.
explanation: >-
  Projection sources are enrichment-tree paths. The asterisk iterates over a collection, so the table gets one row per
  element rather than one row per document. Without it, the source must be an object, typically a Shaper output.
source: handoff
```

```question
prompt: You delete the search service. What happens to the knowledge store's tables and blobs?
options:
  - They are deleted with the service
  - They remain in Azure Storage and keep costing storage until you delete them
  - They become read-only and expire after 30 days
answer: They remain in Azure Storage and keep costing storage until you delete them
explanation: >-
  Projections are independent objects in a storage account. Teardown must cover the storage account or containers
  explicitly. The course's verify sweep finds the storage account by its tag because it lives in the course group.
```

```question
prompt: How is a knowledge store different from a search index, and from a knowledge base for agentic retrieval?
answer: A search index is what queries run against; a knowledge store is secondary storage in Azure Storage that the skillset writes for other consumers; a knowledge base is an agentic-retrieval object over knowledge sources. Only the index is searched by the query APIs.
explanation: >-
  They share words, not purpose. Confusing them leads to designs that expect to query a knowledge store, or that
  duplicate enrichment into storage nobody reads.
```

## Hands-on

Implement in `index.ts` (offline; nothing is deployed):

- `chunkShaper()`: a Shaper skill that gathers `id`, `title`, `sourceUri`, `language` and `keyPhrases` into `/document/chunkShape`.
- `northbankKnowledgeStore(storageAccountId)`: a keyless connection string and one projection group with the two tables and the object projection in the diagram.
- `reviewKnowledgeStore(store, produced)`: problems for a non-keyless connection, sources outside `/document` or not produced, invalid table and container names, file projections that are not images, empty groups and two projections writing one target.
- `projectTable(tree, documentKey, table)`: a model of the rows one document produces, with an illustrative generated key (`<documentKey>_<tableName>_<i>`; the service's own format differs and is not something to rely on).

## Recap and next

You can describe table, object and file projections, write their enrichment-tree sources, explain projection groups, and say what a knowledge store costs after everything else is gone. **Next:** step 23 queries the live index the way the application will, with governance on every request, and ends Module 3 with shutdown and verification.

## Further reading

- [Knowledge store concepts](https://learn.microsoft.com/en-us/azure/search/knowledge-store-concept-intro)
- [Knowledge store projections](https://learn.microsoft.com/en-us/azure/search/knowledge-store-projection-overview)
- [Define projections (examples)](https://learn.microsoft.com/en-us/azure/search/knowledge-store-projections-examples)
- [Shaper skill](https://learn.microsoft.com/en-us/azure/search/cognitive-search-skill-shaper)
- [Connect to Azure Storage using a managed identity (roles per task)](https://learn.microsoft.com/en-us/azure/search/search-howto-managed-identities-storage)
