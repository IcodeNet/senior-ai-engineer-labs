# 17 · Provision Azure and create a real index

> **Cost notice.** The live tests in this step call real, billable Azure resources that you create with the **Set up Azure** action. Azure AI Search Basic is charged for every hour it exists; Azure OpenAI is charged per token. While anything may exist, a red cost banner shows on every lesson. When you finish the lab, run **Shut down Azure** and then **Verify cost is zero** (lesson 21). Without Azure, the live tests are skipped and the offline tests still check your code.

## Set up Azure (once for steps 17–21)
Everything in this section runs from the **Actions** tab of the output panel, group **Lab 03 · Real Azure**. Each action runs a course script (`npm run azure:*` in `course/`) and streams its output there. Every action also works from a terminal in `course/` (the fallback commands are shown below).

### Prerequisites
- **An Azure subscription** you may spend a few dollars in. A free-trial or Visual Studio subscription works if it allows Azure OpenAI and Azure AI Search Basic.
- **Permission to create resource groups and role assignments** in it: **Owner**, or **Contributor plus User Access Administrator** (Role Based Access Control Administrator also grants role assignments). Set-up gives your own account data-plane roles on the new resources because API keys are disabled. Contributor alone fails at the role-assignment step.
- **The Azure CLI** ([install](https://aka.ms/azure-cli)), signed in as a user rather than a service principal. The course scripts use your `az` login for everything; they never ask for or store a key or secret. From a terminal:

  ```sh
  az login                                  # opens a browser; pick your account
  az account set --subscription "<name or id>"   # only if you have several
  az account show --query "{name:name, id:id, user:user.name}"   # what the course will use
  ```

  The Icode actions run with the same `az` login, so sign in once in any terminal. If an action reports "Not signed in to Azure", sign in and run it again.

### The actions
| Action (Actions tab) | Terminal fallback | What it does | Cost |
|---|---|---|---|
| Show live Azure prices (no sign-in) | `npm run azure:prices` | Reads list prices for `azure/config.json`'s region from the Azure Retail Prices API. | None |
| Plan Azure set-up (creates nothing) | `npm run azure:plan` | Shows the subscription, signed-in user and resource group it would use, checks both models are offered in the region, and prints live prices. | None |
| Set up Azure (billable) | `npm run azure:up` | Runs the plan, then asks you to type `create`. Creates the resource group, deploys `azure/main.bicep` and writes endpoints to `course/.azure/env.json`. Takes several minutes. | Starts billing |
| Azure status and cost so far | `npm run azure:status` | Lists what is running and estimates the search cost since creation. | None |
| Shut down Azure (delete everything) | `npm run azure:down` | Asks you to type the resource group name, deletes the group, purges the soft-deleted Azure OpenAI account, then runs Verify. | Stops billing |
| Verify cost is zero | `npm run azure:verify` | Checks the subscription for anything left with the course tag, including soft-deleted accounts. | None |

**Typed confirmations.** Set up and Shut down are marked **Destructive**. When one needs your confirmation, Icode opens a dialog. The confirm button stays disabled until you type the exact text: `create`, or the resource group name. **Cancel** sends nothing, and the script stops without changing anything. In a terminal, the same scripts ask at the prompt. They refuse piped or scripted input (`echo create | npm run azure:up` does nothing), so a confirmation always comes from a person.

**Running and cancelling.** An action keeps running if you reload or close the tab. Come back to the Actions tab to follow it. Only **Cancel action** stops it. Cancelling set-up or shutdown part-way can leave resources running and billing, so the cost banner stays on until **Verify cost is zero** passes.

### The cost banner
The banner is driven by files in `course/.azure/`, which the scripts write. It fails closed: when in doubt, it shows.

| Banner | Shown while | Clears when |
|---|---|---|
| "Lab 03 Azure resources exist" | `.azure/env.json` exists: set-up finished | Shut down and Verify pass |
| "Paid Lab 03 Azure resources may exist" | set-up or shutdown started but did not finish, or a check found course resources | Verify finds nothing |
| "Cost status unknown" | the last status, shutdown or verify could not read your subscription: signed out, `az` missing, a different subscription selected, or an Azure error. The reason is in `.azure/cost-status-unknown.json`. Icode also shows this banner if it cannot check the files at all. | a later check succeeds |

The banner only knows about this checkout. If you set up from another machine, run **Verify cost is zero** here to check the subscription.

### Region and models
`azure/config.json` sets the region (default `swedencentral`), the chat model (`gpt-5-mini`, version `2025-08-07`, `GlobalStandard`) and the embedding model (`text-embedding-3-small`, version `1`, `GlobalStandard`, 1536 dimensions). **Plan** refuses a model that the region does not offer, or that retires within a week, and lists the versions it found:

```text
✖ Model gpt-5-mini 2025-08-07 (GlobalStandard): version 2025-08-07 not offered here (available: …)
```

Check availability yourself with:

```sh
az cognitiveservices model list --location swedencentral \
  --query "[?model.name=='gpt-5-mini'].{version:model.version, skus:join(',', model.skus[].name), retires:model.deprecation.inference}" -o table
az cognitiveservices model list --location swedencentral \
  --query "[?model.name=='text-embedding-3-small'].{version:model.version, skus:join(',', model.skus[].name)}" -o table
```

Then edit `azure/config.json`: change `region` to one that lists both models, or change `version` or `sku` to one that is listed. If you change the embedding model, set `dimensions` to its vector size, because the index (this step) and the embeddings (step 18) must match. Some subscriptions also have no quota for a model in a region. Set-up then fails with a quota error. Anything it already created, such as the search service, stays and bills until you run **Shut down Azure**; the "may exist" banner reminds you. Try another region, or lower `capacity` (thousands of tokens per minute). Run **Plan** again until both models show ✔.

### What it costs
List prices from the public [Azure Retail Prices API](https://learn.microsoft.com/rest/api/cost-management/retail-prices/azure-retail-prices) for `swedencentral`, in USD, retrieved 2026-11-28 by **Show live Azure prices** (CI run [46085568640](https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46085568640)). Your currency, agreement and taxes may differ. Run the action for today's prices in your region.

| Resource set-up creates | Billing | List price |
|---|---|---|
| Azure AI Search, Basic, 1 search unit (semantic ranker on its free plan) | every hour it exists, used or not | 0.101 USD/hour ≈ 2.42 USD/day ≈ 73.73 USD/month |
| Azure OpenAI `text-embedding-3-small` (GlobalStandard) | per token | 0.00002 USD per 1K tokens (0.02 USD per million) |
| Azure OpenAI `gpt-5-mini` (GlobalStandard) | per input and output token | input 0.25, cached input 0.025, output 2.00 USD per million tokens |
| Semantic ranker, free plan | monthly allowance; over it, requests fail rather than bill | 0 |
| Role assignments, resource group | — | 0 |

Steps 17–21 embed a few dozen short documents and send a few dozen chat requests. Even a generous 100,000 input and 150,000 output tokens (`gpt-5-mini` is a reasoning model, and its thinking is billed as output) cost about 0.33 USD. Embeddings cost a fraction of a cent. A session that sets up, works through steps 17–21 in four hours and shuts down is therefore about 0.40 USD of search plus tokens: **under 1 USD**. A forgotten search service costs about 2.42 USD every day, about 74 USD a month.

**Plan** checks your models and prints the search price for your region before anything is created. Its output, abridged, with your own subscription and resource group:

```text
Subscription: <your subscription> (<id>)
Signed in as: <you>
Region:       swedencentral
Resource group (course only): rg-saiel-course-<6 hex>

✔ Model gpt-5-mini 2025-08-07 (GlobalStandard), retires <date>
✔ Model text-embedding-3-small 1 (GlobalStandard)

What “Set up Azure” (`npm run azure:up`) creates and what it costs:
  • Azure AI Search, Basic tier, 1 search unit — billed every hour it exists: 0.101 USD/hour (≈ 2.42 USD/day)
  • Semantic ranker on the free plan — monthly allowance; extra requests fail instead of being billed.
  • Azure OpenAI (S0) with an embedding and a chat deployment — pay per token, no hourly charge; …
  • Role assignments for you (no keys are created).
```

**Budget alerts notify you; they do not cap spending.** An Azure budget on the subscription or resource group sends an email when a threshold is crossed. Resources keep running and billing, and cost data can lag by up to a day. A budget is a useful safety net, but only **Shut down Azure** stops the charges. Stopping Icode, closing the laptop or letting the `expiresAt` tag pass do not delete anything.

### After set-up
Set-up creates one resource group named `rg-saiel-course-<hash of subscription and user>`, tagged `course=senior-ai-engineer-labs`, `owner` and `expiresAt`. It contains an Azure AI Search **Basic** service (semantic ranker on its free plan) and an Azure OpenAI account with an `embed` and a `chat` deployment. API keys are disabled: you get role assignments, and every call uses a Microsoft Entra ID token from `az`. Role assignments can take a few minutes to apply, so a 403 right after set-up usually means "wait and retry". Then run this step's tests: the live tests now run against your index.

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
