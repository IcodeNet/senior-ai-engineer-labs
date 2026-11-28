# 18 · Create the Northbank index on Azure

*Module 3 · Provision and load (live) · step 2 of 7 · Track: TypeScript*

> **Cost notice.** The live test calls the billable resources that **Set up Azure** creates (lesson 17). Without them it is skipped and the offline tests still check your code.

## Concept

`northbank.ts` holds the schema you designed in step 11: `northbank-faq-v1`, one document per FAQ chunk, with filterable governance fields and a vector placeholder. This step puts it on the service with `PUT /indexes/northbank-faq-v1` and, more importantly, decides what to do the **second** time you deploy it, when the definition has changed.

```text
desired definition ──► GET /indexes/<name> ──► diff ──► none    : do nothing
                                                   ├──► update  : PUT in place (add a field, change retrievable…)
                                                   └──► rebuild : refuse; create northbank-faq-v2, load it, move an alias
```

Why a senior engineer cares: an index is a physical structure. Some changes are free, some silently need every document reloaded, and the dangerous ones are discovered in production when someone "just makes it filterable".

## Theory

**The index is physical.** When you create an index, the service allocates storage per field: an inverted index per searchable field, a vector index per vector field, and per-attribute structures for filter, sort and facet. That is why most field changes cannot be applied to existing data.

**Updates with no rebuild.** Microsoft lists these as safe in place: adding a field (existing documents get `null` for it until reloaded), setting `retrievable`, changing `searchAnalyzer` on a field that has an `indexAnalyzer`, adding analyzer definitions, scoring profiles, synonym maps, semantic configurations, CORS settings, a description, and new vector configurations for **new** fields.

**Changes that need a rebuild.** Deleting a field (it stays physically until the rebuild), renaming it, changing its type, or changing `searchable`, `filterable`, `sortable` or `facetable`; assigning an analyzer to an existing field; changing an analyzer definition; adding an existing field to a suggester. For vector fields, dimensions and an already-vectorised field's profile are part of its physical layout. The service rejects such a PUT; dropping and recreating the index loses every document and breaks queries until it is reloaded.

**The safe rebuild: versions and aliases.** Name indexes with a version (`northbank-faq-v1`), build `-v2` side by side, load and test it, then switch an **index alias** that the application queries. The alias update is atomic for callers, and v1 stays until you are sure. The cost is temporary double storage on the service, which on Basic is a real limit: check `servicestats` (step 17) first.

**Defaults hide differences.** If you omit an attribute, REST applies a default (strings searchable, most fields filterable, sortable and facetable; vector fields searchable only, and not retrievable through REST). `GET` returns every attribute filled in, so a naive comparison sees "changes" that are not there, and a definition that relied on defaults can drift between REST and SDK clients. Step 11 set every attribute explicitly for this reason; this step's diff compares effective values.

**Permissions.** Creating or changing an index needs **Search Service Contributor**; loading documents needs **Search Index Data Contributor**. Set-up gave you both, scoped to the course service.

**When not to do this.** During early design, dropping and recreating a small index is fine and quicker. The plan-and-alias discipline matters once anything depends on the index.

## Check questions

```question
prompt: You need status to become facetable on a live index with a million documents. What do you do?
options:
  - PUT the updated definition; the service rebuilds the facet structures in the background
  - Create northbank-faq-v2 with the new attribute, load it, then switch the alias the application uses
  - Set retrievable to false and true again to force a refresh
answer: Create northbank-faq-v2 with the new attribute, load it, then switch the alias the application uses
explanation: >-
  Changing searchable, filterable, sortable or facetable on an existing field requires a rebuild. Building a new version
  side by side and moving an alias avoids downtime and keeps the old index for rollback.
```

```question
prompt: You add a keyPhrases field to an existing index with a PUT. What do existing documents contain for it?
answer: null, until they are reloaded or the indexer runs again and supplies values.
explanation: >-
  Adding a field is an in-place update. The service gives existing documents a null value; the next indexing run
  fills it. Queries keep working during the change, but results vary until content catches up.
```

```question
prompt: Why does a plan that compares the desired definition with GET's response need to know REST defaults?
answer: Because GET returns every attribute filled in, so an attribute omitted in the desired definition would otherwise look like a change, or a real change could be hidden.
explanation: >-
  Compare effective values, not literal JSON. Better still, set attributes explicitly, as the Northbank schema does,
  so REST, SDKs and reviewers all see the same definition.
```

```question
prompt: Why should deployIndex refuse a rebuild rather than delete and recreate the index automatically?
answer: Deleting an index is irreversible and drops every document; queries fail until it is reloaded. A rebuild is a migration with a new version and an alias, which needs a deliberate decision.
explanation: >-
  Automation should make the safe path easy and the destructive path explicit. The error message names the next
  version, which is the first step of the safe path.
```

## Hands-on

Implement in `index.ts`:

- `effective(field, attribute)`: the explicit value, or the REST default.
- `diffIndex(existing, desired)`: one `Change` per difference, by field name: `add-field`, `remove-field`, `change-type`, `change-key`, `change-attribute` (searchable, filterable, sortable, facetable), `change-retrievable`, `change-analyzer`, and for vector fields `change-dimensions` and `change-vector-profile`; then `change-description`.
- `planDeployment(existing, desired)`: `create`, `none`, `update`, or `rebuild` with `rebuildReasons` (the details of the changes that need one).
- `nextVersion(name)`: `northbank-faq-v1` → `northbank-faq-v2`.
- `getIndex(http, endpoint, name)`: `GET /indexes/<name>`; `404` is `undefined`.
- `deployIndex(http, endpoint, desired)`: plan, then PUT for `create` or `update` (accept 200 or 201), nothing for `none`, and for `rebuild` throw `rebuild required for <name>: <reasons>. Create <next version>, …`.

With Azure set up, the live test deploys `northbank-faq-v1` with your embedding dimensions, reads it back, and proves a second deploy is a no-op.

## Recap and next

You can put a schema on the service and tell a safe update from a rebuild before Azure does, and you know the version-and-alias pattern for rebuilds. **Next:** step 19 loads the index with the push API: batches, document keys, and what `upload`, `merge`, `mergeOrUpload` and `delete` really do.

## Further reading

- [Update or rebuild an index](https://learn.microsoft.com/en-us/azure/search/search-howto-reindex)
- [Create an index: field attributes and defaults](https://learn.microsoft.com/en-us/azure/search/search-how-to-create-search-index)
- [Index aliases](https://learn.microsoft.com/en-us/azure/search/search-how-to-alias)
- [Create a vector index (what can change without a rebuild)](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-create-index)
