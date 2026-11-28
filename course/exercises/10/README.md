# 10 · Field attributes and index definitions

*Module 2 · Index design · step 1 of 3 · Track: TypeScript*

## Concept

An Azure AI Search **index** is a schema of fields, saved on the service, plus the documents you load into it. Each field has a type and **attributes** that decide what queries can do with it. Attributes are not decoration: they decide which data structures are built, how large the index is, and which questions are even possible.

| Attribute | Lets you… | Notes |
|---|---|---|
| `searchable` | full-text (or vector) search the field | text is analyzed into terms (step 06) |
| `filterable` | use it in `$filter` | strings are compared **exactly**, not word-broken |
| `sortable` | use it in `$orderby` | not on collections |
| `facetable` | count hits by value | not on `Edm.GeographyPoint` |
| `retrievable` | return it in results and `$select` | `false` hides it from results but it can still affect ranking, filtering and facets |
| `key` | identify the document | exactly one, `Edm.String`, must be retrievable |

Why a senior engineer cares: existing field definitions are **locked for the lifetime of the index**. You can add fields, but changing a field's type, attributes or analyzer means a rebuild. Getting attributes right is cheaper than migrating a production index.

## Theory

**Defaults differ by client.** Through the REST API most attributes are on by default where the type allows them (strings are searchable, filterable, sortable, facetable and retrievable). The .NET SDK does the opposite and leaves unset behaviours off. Vector fields added through REST are not retrievable by default. A definition that relies on defaults means different things in different tools, so set attributes explicitly.

**Attributes cost storage.** `retrievable` does not grow the index; `filterable`, `sortable` and `facetable` store non-tokenized copies of values, and `searchable` builds inverted indexes. Strings that are filterable, sortable or facetable are limited to **32 KB**, because each value is treated as a single term. Long text (a chunk) must therefore set them to `false`.

**Types constrain attributes.** Only string types are full-text searchable. Booleans, numbers and dates are filterable, sortable and facetable but not searchable. `Collection(Edm.String)` cannot be sortable. Vector fields (`Collection(Edm.Single)` and the narrower types) **must be searchable**, **cannot** be filterable, sortable or facetable, take no analyzer, and need `dimensions` equal to the embedding model's output and a `vectorSearchProfile` defined in the index.

**Names follow rules.** Field names start with a letter, use letters, digits and underscores (up to 128 characters) and cannot begin with `azureSearch`. Index names are lower case: letters, digits, dashes and underscores, starting with a letter or digit, with no doubled dashes or underscores.

**`retrievable: false` is not access control.** Microsoft is explicit: a non-retrievable field can still influence highlighting, facets, ranking and filtering. Sensitive data that must not be disclosed should not be in the index, or must be in a separate index with its own access.

**Validate before you send.** The service rejects invalid definitions, but a local validator in CI catches mistakes in review, documents your intent and runs in milliseconds. That is what you build here.

## Check questions

```question
prompt: Which fields should be searchable and which filterable in a governed FAQ index?
options:
  - Everything searchable and filterable, to keep options open
  - Text such as title and chunk searchable; metadata used in exact conditions, such as status, category and dates, filterable
  - Only the key filterable; everything else searchable
answer: Text such as title and chunk searchable; metadata used in exact conditions, such as status, category and dates, filterable
explanation: >-
  Attributes should match the query workload. Text needs analysis for full-text search; governance and navigation
  metadata needs exact comparison. Turning everything on wastes storage, breaks on long text (32 KB limit for
  filterable strings) and invites accidental matches, such as full-text search hitting the word "approved".
source: handoff
```

```question
prompt: You set retrievable to false on a field holding internal risk notes. Is the content now safe from disclosure?
answer: No. It is not returned, but it can still influence ranking, highlighting, facets and filtering.
explanation: >-
  Microsoft warns not to assume that excluding a field from results prevents disclosure through all query features.
  Keep sensitive content out of the index, or isolate it in an index with its own permissions.
```

```question
prompt: Why does a vector field fail validation when filterable is true?
answer: Vector fields cannot be filterable, sortable or facetable; filter on separate non-vector fields instead.
explanation: >-
  Vectors are searched by similarity, not compared by value. To restrict a vector query, add filterable metadata
  fields (status, effectiveDate) and filter on those. Module 4 adds the vector field for real.
```

```question
prompt: The same index definition, without explicit attributes, is created once through REST and once through the .NET SDK. What can differ?
answer: Which attributes are on. REST enables most attributes by default; the .NET SDK leaves unset behaviours off.
explanation: >-
  Relying on defaults makes the schema depend on the client that created it. Setting every attribute explicitly
  makes the definition mean one thing everywhere and makes reviews meaningful.
```

```question
prompt: Production needs a field changed from searchable to filterable only. What is the realistic path?
answer: Create a new index version with the new definition and reindex into it (or add a new field), then switch the application over.
explanation: >-
  Existing field definitions are locked for the life of the index. Teams either version the index and cut over, or
  add a new field alongside the old one and remove the obsolete field during a planned rebuild.
```

## Hands-on

Implement in `index.ts` the shape of an Azure Create Index request body and a validator for it:

- `effectiveAttributes(field)`: the attributes a field gets through the REST API when some are omitted (see the table in the tests).
- `validateIndex(definition)`: return a `Problem` for each broken rule, index-level problems first, then each field in order: `index-name`, `key-count`, `field-name`, `duplicate-field`, `unsupported-type`, `key-type`, `key-retrievable`, `searchable-type`, `sortable-type`, `analyzer-target`, `vector-searchable`, `vector-attributes`, `vector-dimensions`, `vector-profile` and `dimensions-target`. Use the effective attributes, not just the flags that were written down.

The model covers the common EDM types; `Edm.GeographyPoint` and complex types are reported as unsupported in this course.

## Recap and next

You can explain each attribute, the type rules, the 32 KB limit on filterable strings, why defaults differ between REST and the SDKs, and why `retrievable: false` is not security. **Next:** step 11 designs the Northbank index with governance fields built in.

## Further reading

- [Search indexes in Azure AI Search (field attributes)](https://learn.microsoft.com/en-us/azure/search/search-what-is-an-index)
- [Create an index (attributes by data type)](https://learn.microsoft.com/en-us/azure/search/search-how-to-create-search-index)
- [Create a vector index](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-create-index)
- [Naming rules](https://learn.microsoft.com/en-us/rest/api/searchservice/naming-rules)
- [Supported data types](https://learn.microsoft.com/en-us/rest/api/searchservice/supported-data-types)
