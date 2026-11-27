# 17 · Provision Azure and create a real index

> **Cost notice.** The live tests in this step call real, billable Azure resources created by `npm run azure:up`. Azure AI Search Basic is charged for every hour it exists; Azure OpenAI is charged per token. When you finish the lab, run `npm run azure:down` and then `npm run azure:verify`. Without Azure set up, the live tests are skipped and the offline tests still check your code.

## Set up Azure (once for steps 17–21)
From `course/`, with the [Azure CLI](https://aka.ms/azure-cli) installed:

```sh
az login                 # pick the subscription you want to use
npm run azure:plan       # checks models in your region and shows live prices; changes nothing
npm run azure:up         # type "create" to provision; writes .azure/env.json
npm run azure:status     # what is running and roughly what it has cost so far
```

`azure:up` creates one resource group tagged `course=senior-ai-engineer-labs` containing an Azure AI Search **Basic** service (semantic ranker on its free plan) and an Azure OpenAI account with an embedding and a chat deployment. API keys are disabled: you get role assignments and every call uses a Microsoft Entra ID token from `az`. Role assignments can take a few minutes to apply — a 403 right after setup usually means "wait and retry".

## Why it matters
An Azure AI Search **index** is a schema: which fields are searchable text, which are filters, which hold vectors, and how semantic ranking reads them. Governance lives here. Approval status, version and effective date must be **filterable** so the backend can enforce them on every query, and they should not be full-text searchable. The vector field declares its dimensions — they must match the embedding model exactly — and an HNSW profile with the cosine metric.

Changing a field's type later means rebuilding the index, so schema design is an up-front decision.

## Interview question
> Your team stores approval status only in the source system and filters results in application code after search returns. What can go wrong, and how would you change the index design?

## Your task
Implement in `index.ts`:

- `indexDefinition(name, dimensions)` — fields `id` (string key), `docId`, `title` and `content` (searchable), `status`, `version` (Edm.Int32), `isLatest` (Edm.Boolean) and `effectiveDate` (Edm.DateTimeOffset, sortable) as filters; `contentVector` as `Collection(Edm.Single)` with `dimensions`, not retrievable, using profile `default`; an HNSW algorithm with the cosine metric; a semantic configuration named `default` with `title` as title field and `content` as content field.
- `createOrUpdateIndex(http, endpoint, definition)` — `PUT {endpoint}/indexes/{name}?api-version=<SEARCH_API>` with audience `search`; accept 200 or 201; otherwise throw `create index failed: <status> <Azure error message>`.

`azure.ts` provides the keyless HTTP transport and a fake for tests.

## Going further
Index aliases let you rebuild into a new index and switch atomically; integrated vectorization lets the service call the embedding model itself.
