# 17 · Provision Azure AI Search with Bicep

*Module 3 · Provision and load (live) · step 1 of 7 · Track: TypeScript*

> **Cost notice.** From this step the course can create real, billable Azure resources. Nothing is created until you run **Set up Azure** and type `create`. Azure AI Search Basic is billed for every hour it exists; Azure OpenAI is billed per token; Blob storage is billed per GB and per operation. While anything may exist, a red cost banner shows on every lesson. Shut down with **Shut down Azure**, then **Verify cost is zero** (lesson 23). Without Azure, the live tests are skipped and the offline tests still check your code.

## Concept

Module 2 designed the Northbank index on your machine. Module 3 makes it real: a search service in Azure, the index on it, documents loaded two ways (push and pull), and queries against it. This step is about the service itself: what you are renting, what it costs per hour, and how one Bicep file creates it with no keys anywhere.

```text
azure/main.bicep  ──►  one resource group, tagged course=senior-ai-engineer-labs
                       ├─ Azure AI Search, Basic, 1 search unit, system-assigned identity, keys off
                       ├─ Azure OpenAI (S0): "embed" and "chat" deployments, keys off
                       ├─ Storage account (StorageV2, LRS): container "northbank-faq", shared keys off
                       └─ role assignments: you → search, OpenAI, blobs; search identity → blobs (read), OpenAI (use)
```

Why a senior engineer cares: the tier decides features, limits and the bill, and most of it cannot be changed later without rebuilding. Infrastructure as code makes the decision reviewable, repeatable and removable.

## Theory

**Pricing models and tiers.** Azure AI Search has two pricing models. **Dedicated** tiers (Free, Basic, Standard S1–S3, Storage Optimized L1–L2) give you fixed capacity in **search units**. **Serverless** is consumption-based (compute units and GB stored), has no replicas or partitions to set, and cannot be migrated to or from the dedicated tiers. The course uses dedicated Basic, so the cost model is simple and visible.

**Search units: replicas × partitions.** Partitions hold storage and indexing capacity; replicas serve queries and give availability. A service starts at one of each, one search unit, and adding either multiplies the hourly rate linearly: three replicas cost three times one. Basic supports up to three replicas. Billing is per search unit per hour, around the clock, whether you query or not. There is no pause: only deleting the service stops the charge.

**Why Basic, not Free.** Free is shared, limited, cannot scale, can be deleted after inactivity and, critically here, has **no managed identity for outbound indexer access**. The pull pipeline (steps 20–21) and integrated vectorization (step 28) need the service's own identity to read Blob storage and call Azure OpenAI without keys. Basic is the cheapest tier that supports that. You can switch between Basic and Standard later; other tier changes need a new service and a rebuild.

**The semantic ranker plan.** The ranker is a premium feature with two plans: **free** (the default; a monthly allowance, then requests fail with a billing error) and **standard** (pay as you go after the allowance; Basic or higher). Charges occur only for `queryType=semantic` requests with a non-empty search string. The course pins `semanticSearch: 'free'`, so a runaway loop fails instead of billing. From Search REST `2026-04-01`, agentic retrieval has its own billing consent (`knowledgeRetrieval`), separate from the ranker.

**Keyless by construction.** `disableLocalAuth: true` on search and Azure OpenAI, and `allowSharedKeyAccess: false` on storage, mean API keys and account keys do not work at all. You call the data planes with Microsoft Entra ID tokens from `az`, authorised by role assignments. The search service's **system-assigned identity** gets **Storage Blob Data Reader** on the storage account and **Cognitive Services OpenAI User** on Azure OpenAI: least privilege for what indexers do. Role assignments are scoped to resources inside the course group, so deleting the group deletes them too.

**What costs money.**

| Resource | Billed by | Stops when |
|---|---|---|
| Search, Basic, 1 unit | every hour it exists | the service is deleted |
| Azure OpenAI deployments | tokens sent and received | you stop calling them (the account itself has no hourly charge) |
| Built-in AI skills (key phrases, language) | 20 documents per indexer per day free; beyond that they need a billable Azure AI services resource, otherwise they fail | – |
| Storage account | GB stored per month and operations | it is deleted |
| Role assignments, resource group, budgets | free | – |

**Failure modes.** A forgotten Basic service costs a day's charge every day. Quota errors part-way through set-up leave what was already created running. A 403 straight after set-up usually means role assignments have not propagated yet: wait a few minutes. Budgets notify; they never stop spending.

**When not to do this.** If you only need to try queries once, the Azure portal's import wizard is faster. Use Bicep when the environment must be reviewed, repeated and torn down with confidence.

## Check questions

```question
prompt: A Basic service has 1 replica and 1 partition. You add 2 replicas for availability. What happens to the hourly charge?
options:
  - It stays the same, because replicas only serve queries
  - It triples, because cost is per search unit and units are replicas × partitions
  - It doubles, because only the added replicas are billed at half rate
answer: It triples, because cost is per search unit and units are replicas × partitions
explanation: >-
  Dedicated tiers bill per search unit per hour, and units are replicas multiplied by partitions. Three replicas and one
  partition are three units, so three times the hourly rate, every hour, whether queried or not.
```

```question
prompt: Why does the course provision Basic rather than the Free tier, even for a short lab?
answer: Free has no managed identity for outbound indexer access, so a keyless indexer could not read Blob storage or call Azure OpenAI; Basic is the cheapest tier that can.
explanation: >-
  Free is also shared, unscalable and can be deleted after inactivity. The decisive point for this course is identity:
  the pull pipeline and integrated vectorization must authenticate as the search service, not with keys.
```

```question
prompt: The semantic ranker is on the free plan and the monthly allowance runs out. What happens to further semantic queries?
options:
  - They are billed at the standard rate
  - They fail with a billing error until the allowance resets or you switch to the standard plan
  - They silently fall back to vector search
answer: They fail with a billing error until the allowance resets or you switch to the standard plan
explanation: >-
  The free plan caps usage; it never bills. Only the standard plan bills beyond the allowance. That is why the course
  pins semanticSearch to free: a bug that loops over semantic queries fails loudly instead of spending.
```

```question
prompt: disableLocalAuth is true on the search service. A colleague pastes an admin API key into a script. What happens, and why is that the point?
answer: >-
  The request is rejected: with local authentication disabled, keys are not accepted at all, so only Entra ID tokens with role assignments work and there is no shared secret to leak.
explanation: >-
  Keyless is a property of the resource, not a coding convention. It removes key rotation, key leakage and
  all-powerful admin keys, and access becomes auditable per identity through role assignments.
```

## Hands-on

Implement in `index.ts`, offline first:

- `searchUnits(spec)`: replicas × partitions. Partitions must be 1, 2, 3, 4, 6 or 12; replicas 1–12; Basic at most 3 replicas; Free is 0 units and cannot be scaled. Throw `RangeError` otherwise.
- `serviceCost(spec, unitHourPrice)`: `{ units, hourly, thirtyDays }`, rounded to the cent. The tests use illustrative prices.
- `reviewSearchService(spec)`: one finding per broken rule: `free-tier`, `local-auth`, `identity`, `semantic-billing`, `tags` (course, owner, expiresAt) and `capacity` (more than one unit).
- `serviceUsage(http, endpoint)`: `GET /servicestats` with audience `search`; map `indexesCount`, `indexersCount`, `dataSourcesCount`, `storageSize` and `vectorIndexSize` to `{ used, quota }`; throw `service statistics failed: <status> <message>` or on a missing counter.

`azure.ts` provides the keyless HTTP transport, a fake for tests, and `live`, which is set only when `course/.azure/env.json` exists. Then read `azure/main.bicep`: your `reviewSearchService` rules are what it declares.

### Set up Azure (once for Modules 3 and 4)

Everything runs from the **Actions** tab of the output panel, group **Module 3 · Azure**. Each action runs a course script (`npm run azure:*` in `course/`) and streams its output there; each also works from a terminal in `course/`.

**Prerequisites.**
- An Azure subscription you may spend a few dollars in, which allows Azure OpenAI and Azure AI Search Basic.
- **Owner**, or **Contributor plus User Access Administrator** (or Role Based Access Control Administrator), **at subscription scope**. Set-up creates role assignments, which Contributor alone cannot; shutdown purges the soft-deleted Azure OpenAI account, which needs `Microsoft.CognitiveServices/locations/resourceGroups/deletedAccounts/delete` at subscription level.
- The [Azure CLI](https://aka.ms/azure-cli), signed in as a user (not a service principal). The scripts use your `az` login for everything and never ask for or store a key:

  ```sh
  az login
  az account set --subscription "<name or id>"   # only if you have several
  az account show --query "{name:name, id:id, user:user.name}"
  ```

| Action (Actions tab) | Terminal | What it does | Cost |
|---|---|---|---|
| Show live Azure prices (no sign-in) | `npm run azure:prices` | List prices for `azure/config.json`'s region from the Azure Retail Prices API | none |
| Plan Azure set-up (creates nothing) | `npm run azure:plan` | Subscription, user and resource group it would use; checks both models are offered; live prices | none |
| Set up Azure (billable) | `npm run azure:up` | Runs the plan, asks you to type `create`, creates the group, deploys `azure/main.bicep`, writes `course/.azure/env.json` | starts billing |
| Azure status and cost so far | `npm run azure:status` | What is running and the search cost since creation | none |
| Shut down Azure (delete everything) | `npm run azure:down` | Asks for the group name, deletes the group, purges the soft-deleted OpenAI account, verifies | stops billing |
| Verify cost is zero | `npm run azure:verify` | Sweeps the subscription for anything with the course tag, including soft-deleted accounts | none |

**Typed confirmations.** Set up and Shut down are marked **Destructive**. Icode opens a dialog whose confirm button stays disabled until you type the exact text: `create`, or the resource group name. **Cancel** sends nothing and changes nothing. In a terminal the same scripts ask at the prompt. Your own machine is trusted: the checks stop accidental and automated answers (piped input such as `echo create | npm run azure:up`, input that arrives before the question, a confirmation forged in tool output without the run's token). They cannot stop a program that deliberately imitates Icode, so do not let scripts or agents run these actions unattended.

**Running and cancelling.** An action keeps running if you reload or close the tab; only **Cancel action** stops it. Cancelling set-up or shutdown part-way can leave resources billing, so the banner stays until Verify passes.

**The cost banner fails closed.**

| Banner | Shown while | Clears when |
|---|---|---|
| "Course Azure resources exist" | `.azure/env.json` exists | Shut down and Verify pass |
| "Paid course Azure resources may exist" | set-up or shutdown did not finish, or a check found course resources | Verify finds nothing |
| "Cost status unknown" | a check failed (signed out, `az` missing, an Azure error), the subscription is unclear, or `course/.azure/` was deleted after set-up; the reason is in `.azure/cost-status-unknown.json` | Verify succeeds in the recorded subscription |

Do not delete `course/.azure/` while resources may exist. Set-up keeps a copy of the record outside the course folder (`~/.config/icode-workshop/senior-ai-engineer-labs-azure.json`, or `$XDG_CONFIG_HOME`; `%APPDATA%\icode-workshop\…` on Windows). While it exists, the `azure-cost-watch` sidecar (Processes tab) and every Azure action restore a "Cost status unknown" banner within seconds if `course/.azure/` is gone. Only a passing **Verify cost is zero** removes it. The record is per machine.

**Region and models.** `azure/config.json` sets the region (`swedencentral`), the chat model (`gpt-5-mini` `2025-08-07`, `GlobalStandard`), the embedding model (`text-embedding-3-small` `1`, `GlobalStandard`, 1536 dimensions) and the Blob container (`northbank-faq`). **Plan** refuses a model the region does not offer, or that retires within a week, and lists what it found. Check yourself with:

```sh
az cognitiveservices model list --location swedencentral \
  --query "[?model.name=='text-embedding-3-small'].{version:model.version, skus:join(',', model.skus[].name)}" -o table
```

Edit `region`, `version` or `sku` until **Plan** shows ✔ for both. If you change the embedding model, set `dimensions` to its vector size: the index and the embeddings must match. A quota error part-way through set-up leaves what was created running; the "may exist" banner reminds you to shut down.

**What it costs.** List prices from the public [Azure Retail Prices API](https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices) for `swedencentral`, in USD, retrieved 2026-11-28 by **Show live Azure prices** (CI run [46085568640](https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46085568640)). Run the action for today's prices in your region; your agreement, currency and taxes may differ.

| Resource | Billing | List price |
|---|---|---|
| Azure AI Search, Basic, 1 search unit | every hour it exists | 0.101 USD/hour ≈ 2.42 USD/day ≈ 73.73 USD/month |
| `text-embedding-3-small` (GlobalStandard) | per token | 0.02 USD per million tokens |
| `gpt-5-mini` (GlobalStandard) | per input and output token | input 0.25, cached input 0.025, output 2.00 USD per million tokens |
| Storage account, Standard LRS | per GB-month and per operation | the course stores a few kilobytes; use the [pricing calculator](https://azure.microsoft.com/pricing/calculator/) for your region |
| Semantic ranker (free plan), key phrase and language skills (first 20 documents per indexer per day) | allowance | 0 within the allowance |

Modules 3 and 4 embed a few dozen short chunks and run a handful of indexers. A session that sets up, works for four hours and shuts down costs about 0.40 USD of search plus a few cents of tokens: **under 1 USD**. A forgotten service costs about 2.42 USD a day.

After set-up, the group `rg-saiel-course-<6 hex>` is tagged `course`, `owner` and `expiresAt` (the tag is a reminder; nothing deletes on expiry). Run this step's tests again: the live test reads your service's limits.

## Recap and next

You know what a search unit is and that it bills by the hour, why Basic is the floor for keyless indexers, how the semantic ranker plans fail or bill, and how `main.bicep` creates everything with no keys. You can set up, check status, shut down and verify from the Actions tab. **Next:** step 18 creates the Northbank index on the live service and learns which schema changes Azure can apply in place and which need a rebuild.

## Further reading

- [Choose a pricing model and service tier](https://learn.microsoft.com/en-us/azure/search/search-sku-tier)
- [Plan and manage costs](https://learn.microsoft.com/en-us/azure/search/search-sku-manage-costs)
- [Enable or disable semantic ranker billing](https://learn.microsoft.com/en-us/azure/search/semantic-how-to-enable-disable)
- [Connect to Azure Storage using a managed identity](https://learn.microsoft.com/en-us/azure/search/search-howto-managed-identities-storage)
- [Key Phrase Extraction skill (billing note)](https://learn.microsoft.com/en-us/azure/search/cognitive-search-skill-keyphrases)
- [Get Service Statistics](https://learn.microsoft.com/en-us/rest/api/searchservice/get-service-statistics/get-service-statistics)
- [Data plane REST API versions](https://learn.microsoft.com/en-us/rest/api/searchservice/search-service-api-versions)
