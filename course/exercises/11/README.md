# 11 · The Northbank Support schema

*Module 2 · Index design · step 2 of 3 · Track: TypeScript*

## Concept

Now design the index the rest of the course uses: `northbank-faq-v1`. One search document per **chunk** of an FAQ answer, carrying everything retrieval, governance and citation need.

| Field | Type | searchable | filterable | sortable | facetable | retrievable | Why |
|---|---|---|---|---|---|---|---|
| `id` | String (key) | – | ✔ | – | – | ✔ | stable chunk key |
| `title` | String | ✔ | – | – | – | ✔ | short, high-signal text |
| `chunk` | String | ✔ | – | – | – | ✔ | the evidence; can exceed 32 KB, so never filterable |
| `sourceUri` | String | – | ✔ | – | – | ✔ | citation, and delete-by-source when an answer is withdrawn |
| `status` | String | – | ✔ | – | ✔ | ✔ | `draft`, `approved` or `retired` |
| `effectiveDate` | DateTimeOffset | – | ✔ | ✔ | – | ✔ | not in force before this |
| `expiryDate` | DateTimeOffset | – | ✔ | ✔ | – | ✔ | not in force after this; `null` when open-ended |
| `contentVector` | Collection(Single) | ✔ | – | – | – | – | placeholder until Module 4 adds embeddings |

Why a senior engineer cares: governance is a **schema property**. If `status` is not filterable, the server cannot enforce approval, and someone will try to do it in a prompt.

## Theory

**Design governance fields before the pipeline.** The filter that keeps drafts out (`status eq 'approved'` plus the date window) runs on every query. That needs the fields to exist, be filterable, have the right types and contain clean values. Dates are `Edm.DateTimeOffset`, not strings, so range comparisons work. Status is not searchable: you never want full-text search for the word "approved" to stand in for an approval check.

**`status` string or `approved` Boolean?** Both are valid designs, and they are not interchangeable. A Boolean `approved` is simple but cannot express a lifecycle. A `status` string models `draft → approved → retired` and leaves room for states such as `under-review`. Northbank chooses `status`. The filter must match the design you chose (step 12): `approved eq true` against this index is an error, not an empty result.

**Keys are per chunk and stable.** Document keys may use letters, digits, `-`, `_` and `=`, up to 1,024 characters, and are case-sensitive. A URL contains `/`, `:` and `#`, so encode it: URL-safe Base64 of `<sourceUri>#<chunkIndex>` is reversible, stable across reloads (so `mergeOrUpload` replaces rather than duplicates) and unique per chunk.

**Clean values at the door.** A filterable string compares exactly, so `Approved` is not `approved`. Validate status values and dates when you build documents. A typo in a governance value either hides a valid answer or, worse, lets an invalid one past a filter written against a different spelling.

**The vector field is a placeholder.** It is declared now, with its `dimensions` taken from the embedding model, so the schema is complete. It is not retrievable, because raw vectors add size to responses and nothing to an answer. Module 4 fills it.

**When not to do this.** If content is tiny and never changes, a JSON file and an in-memory filter may be enough. An index pays off when content is large, changes, must be ranked and must be governed on the server.

## Check questions

```question
prompt: Why must status and effectiveDate be filterable before you build the retrieval pipeline?
options:
  - So they appear in search results
  - So the backend can enforce approved and in-date content in every query, on the server
  - So the semantic ranker can read them
answer: So the backend can enforce approved and in-date content in every query, on the server
explanation: >-
  Governance filters are applied by Azure AI Search only on filterable fields. Changing attributes later means a
  rebuild, so governance fields belong in the first version of the schema.
source: handoff
```

```question
prompt: Why are approved eq true and status eq 'approved' not interchangeable?
answer: They belong to two different schema designs, a Boolean field and a string field, and a filter must match the field that actually exists, with the right literal type.
explanation: >-
  Sending approved eq true to an index that has only status is an invalid filter, and status eq true is a type error.
  Pick one design, document it, and generate the filter from it in one place.
source: handoff
```

```question
prompt: Why is the chunk field not filterable, sortable or facetable?
answer: Filterable, sortable and facetable string values are limited to 32 KB because each is stored as a single term, and nobody filters on whole passages anyway.
explanation: >-
  Long text would break indexing and waste storage. Full-text search (searchable) is the right access path for chunk content.
```

```question
prompt: Why base64url-encode "sourceUri#chunkIndex" for the key instead of using the URL directly?
answer: Keys allow only letters, digits, dash, underscore and equals; encoding makes any URL a valid, reversible and stable key.
explanation: >-
  A stable key means reloading a source replaces its chunks instead of duplicating them, and the key can be decoded
  back to its source when debugging. Microsoft recommends URL-safe Base64 for keys with other characters.
```

## Hands-on

`schema.ts` contains your working step 10. Implement in `index.ts`:

- `northbankIndex(dimensions)`: the table above, with **every attribute set explicitly** on non-vector fields, and a `vectorSearch` section with one `hnsw` algorithm and one profile. It must pass step 10's `validateIndex`.
- `documentKey(sourceUri, chunkIndex)`: base64url of `<sourceUri>#<chunkIndex>`; reject empty URIs, bad indexes and keys over 1,024 characters.
- `toSearchDocuments(source)`: one `mergeOrUpload` document per chunk, dates as `YYYY-MM-DDT00:00:00Z`, `expiryDate: null` when absent. Reject unknown statuses, impossible dates and an expiry before the effective date.
- `reviewGovernance(definition)`: step 10's problems (rule `schema`), then the Northbank-specific checks: missing fields, governance types and filterability, chunk attributes, a retrievable `sourceUri`, and explicit attributes.

## Recap and next

The Northbank index has searchable text, filterable and typed governance fields, citations, stable keys and a vector placeholder, and a review that catches the classic mistakes. **Next:** step 12 writes the queries: simple or full Lucene syntax, and OData filters that enforce governance safely.

## Further reading

- [Create an index (schema checklist, attributes by type)](https://learn.microsoft.com/en-us/azure/search/search-how-to-create-search-index)
- [Naming rules (document keys)](https://learn.microsoft.com/en-us/rest/api/searchservice/naming-rules)
- [Supported data types](https://learn.microsoft.com/en-us/rest/api/searchservice/supported-data-types)
- [Add, update or delete documents (mergeOrUpload)](https://learn.microsoft.com/en-us/rest/api/searchservice/documents)
- [Vector storage in an index (vector fields)](https://learn.microsoft.com/en-us/azure/search/vector-store)
