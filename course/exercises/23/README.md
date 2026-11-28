# 23 · Query the live index, then shut down

*Module 3 · Provision and load (live) · step 7 of 7 · Track: TypeScript*

> **Cost notice.** The live test queries the billable search service that **Set up Azure** creates (lesson 17). This lesson ends with **Shut down Azure** and **Verify cost is zero**. Without Azure the live test is skipped and the offline tests still check your code.

## Concept

The application's view of search is one request: `POST /indexes/northbank-faq-v1/docs/search`. Everything Module 2 designed comes together in its body.

```json
{
  "search": "overdraft fee",
  "queryType": "simple",
  "searchFields": "title,chunk",
  "select": "id,title,chunk,sourceUri,status,effectiveDate,expiryDate",
  "filter": "status eq 'approved' and effectiveDate le 2026-11-28T00:00:00Z and (expiryDate eq null or expiryDate ge 2026-11-28T00:00:00Z)",
  "top": 5, "count": true, "highlight": "chunk", "facets": ["status"]
}
```

Why a senior engineer cares: this request is the boundary between the corpus and the model. If governance is optional here, an ungoverned answer is one bug away.

## Theory

**What each parameter does.**

| Parameter | Effect | Northbank choice |
|---|---|---|
| `search`, `queryType`, `searchMode` | the full-text query, its parser (simple or full Lucene) and whether any or all terms must match | simple, `any`; `*` matches everything |
| `searchFields` | which searchable fields the terms are matched against | `title,chunk`; must be searchable |
| `filter` | an OData boolean expression over filterable fields; exact, unscored, applied with the query | governance, always, plus an optional caller filter in parentheses |
| `select` | which retrievable fields come back | text, citation and governance fields; never the vector |
| `top`, `skip` | paging; `top` defaults to 50 | 5 for answers, the evaluation default |
| `count` | `@odata.count`: all documents matching `search` and `filter`, ignoring `top` and `skip`; accurate when the index is stable, may be off while documents are being written | on, to know when nothing matched |
| `highlight` | `@search.highlights`: up to five matched fragments per searchable field, terms wrapped in `<em>` by default | `chunk`, for the UI |
| `facets` | `@search.facets`: counts per value of a facetable field, over the filtered results | `status`, to prove only approved content is in scope |

Each result carries `@search.score`: BM25 relevance for full-text queries (step 07), comparable only within one query.

**Governance is server-side, and checked again.** The filter runs inside the service, before ranking and before anything reaches the application. The client and the prompt never decide what is approved. Because `status`, `effectiveDate` and `expiryDate` are selected, the application can also re-check every hit and treat a failure as a breach to alert on, not a result to show. That check proves the control ran; it does not replace it.

**Facets are computed after the filter.** A facet on `status` returning only `approved` is a cheap, visible test that no draft is in scope. It also shows a risk: facets over unfiltered data would reveal that drafts exist.

**Failure modes.** A filter that references a field that does not exist (`approved eq true` against this schema) is a 400, not an empty result. Asking for a field that is not retrievable silently omits it. Asking `searchFields` for a non-searchable field is an error. Zero results with `count` 0 must reach the user as "no approved answer", never as a model's guess.

## Check questions

```question
prompt: Why enforce the approved-only filter in the backend's search request rather than in the React client or the prompt?
answer: Because only the server-side filter stops unapproved content before it is retrieved; the client and the prompt can be bypassed or ignored, and by then the content has already left the index.
explanation: >-
  Governance is an access-control decision. It belongs with the data, in every query the backend sends, built in one
  place. A model told "ignore drafts" can still quote one it was given.
```

```question
prompt: A colleague sends filter "approved eq true" to northbank-faq-v1. What happens?
options:
  - The query returns no results
  - The service returns a 400 error because the index has no approved field
  - The service ignores the unknown field and returns everything
answer: The service returns a 400 error because the index has no approved field
explanation: >-
  approved eq true and status eq 'approved' belong to different schema designs. Against an index with status, the
  Boolean form is an invalid expression. Generate the filter from the schema in one place.
source: handoff
```

```question
prompt: Why does the request select status and the dates, when the filter has already applied them?
answer: So the application can re-check every hit and raise a breach if one is ungoverned, proving the server-side control ran.
explanation: >-
  Defence in depth: the server filter is the control, the re-check is a test of it in production. It costs a few bytes
  per hit and catches a broken filter, a wrong index or an alias pointing at the wrong version.
```

```question
prompt: What does facets ["status"] return in this request, and why is that useful?
answer: Counts per status over the filtered results, which here should be only "approved", a visible check that nothing else is in scope.
explanation: >-
  Facets are computed over the documents that match the query and filter. Facets over unfiltered data can themselves
  leak information, such as the existence of drafts.
```

## Hands-on

Implement in `index.ts`:

- `buildSearchRequest(search, options)`: the body above. `asOf` is required; `top` 1–50 (default 5); `skip` ≥ 0; `searchFields` only `title` and `chunk`; facets only on `status`; an empty search becomes `*`; the filter comes from `withGovernance` in `northbank.ts`.
- `search(http, endpoint, index, request)`: POST and map `@odata.count`, `@search.score`, `@search.highlights.chunk` and `@search.facets`; throw `search failed: <status> <message>`.
- `assertGoverned(hits, asOf)`: throw `governance breach: …` for a hit that is not approved, not yet in force or expired.

With Azure set up, the live test loads the corpus, queries "overdraft fee" and "Easy Saver rate", and proves the draft and the future rate never appear.

### Shut down Azure (required when you finish)

Search Basic bills every hour until it is deleted. If you continue straight to Module 4, keep the resources; otherwise shut down now and set up again later (set-up recreates everything; the live steps recreate their own objects).

1. **Shut down Azure (delete everything)** (Actions tab, group **Module 3 · Azure**; terminal `npm run azure:down`). It lists every resource in the course group, then asks you to type the group name, `rg-saiel-course-<6 hex>`. It refuses a group not tagged `course=senior-ai-engineer-labs`, deletes the group (search service with its indexes, indexers, data sources and skillsets; the Azure OpenAI account and its deployments; the storage account with the Northbank blob; and every role assignment scoped to them), purges the soft-deleted Azure OpenAI account so nothing of it remains, removes `course/.azure/env.json` and runs Verify.
2. **Verify cost is zero** (terminal `npm run azure:verify`). It works in the subscription and resource group recorded at set-up, never a name recomputed from whoever is signed in now, and sweeps the recorded group, every group and resource tagged `course=senior-ai-engineer-labs` (the storage account included), and soft-deleted Azure OpenAI accounts from any `rg-saiel-course-…` group. Only when all are empty does it print `✔ Verified: no course resources remain … This course incurs no further charges there.` and clear the banner and the record kept outside the course folder.

Without any record (for example on a new machine), shutdown finds the course-tagged groups whose `owner` tag is you, asks for each name in turn and deletes each. It never deletes another owner's group. Cancelling a dialog deletes nothing, and charges continue.

**If Verify finds leftovers**, it lists them and the "may exist" banner stays. In order:

1. Run **Shut down Azure** again: an interrupted or timed-out deletion usually finishes on the second run.
2. Delete the tagged group yourself, in the [Azure portal](https://portal.azure.com) (Resource groups → `rg-saiel-course-…` → Delete resource group) or from a terminal:

   ```sh
   az group list --tag course=senior-ai-engineer-labs -o table
   az group delete --name rg-saiel-course-<6 hex> --yes
   az resource list --tag course=senior-ai-engineer-labs -o table   # anything tagged outside the group, such as a storage account
   ```
3. Purge soft-deleted Azure OpenAI accounts (portal: Azure AI services → Manage deleted resources):

   ```sh
   az cognitiveservices account list-deleted -o table
   az cognitiveservices account purge --location <location> --resource-group rg-saiel-course-<6 hex> --name oai-saiel-<suffix>
   ```
4. Run **Verify cost is zero** again until it passes.

In a shared subscription, Verify also reports other learners' course groups, because they carry the same tag; leave those to their owners.

**If Verify reports "Cost status unknown"**, it could not check, and it neither prints "no further charges" nor removes anything. Signed out or `az` missing: `az login` and verify again. A different subscription selected: Verify names the recorded one; `az account set --subscription <id>`. The record is unreadable or does not name a subscription: sign in to the subscription you used and run `npm run azure:verify -- --subscription <subscription id>` from `course/`. That sweep covers only the subscription you name, so if you are unsure which you used, run it in each.

Budget alerts only notify. Stopping Icode, closing the laptop or the `expiresAt` tag passing deletes nothing. Only a passing Verify tells you the course costs nothing further.

## Recap and next

Module 3 is complete: a keyless Basic service from Bicep, the Northbank index deployed with a safe change plan, documents pushed in correct batches and pulled from Blob with `jsonArray`, enriched with language and key phrases, the knowledge store understood, and governed queries checked hit by hit. Then shutdown and a verified zero. **Next:** Module 4, step 25, starts on chunking: why the unit of retrieval decides answer quality.

## Further reading

- [Search Documents (REST): request parameters](https://learn.microsoft.com/en-us/rest/api/searchservice/documents/search-post)
- [Full-text query: create a query](https://learn.microsoft.com/en-us/azure/search/search-query-create)
- [Filters in keyword search](https://learn.microsoft.com/en-us/azure/search/search-filters)
- [Add faceted navigation](https://learn.microsoft.com/en-us/azure/search/search-faceted-navigation)
- [Hit highlighting](https://learn.microsoft.com/en-us/azure/search/search-pagination-page-layout#hit-highlighting)
- [Plan and manage costs: delete to stop billing](https://learn.microsoft.com/en-us/azure/search/search-sku-manage-costs)
