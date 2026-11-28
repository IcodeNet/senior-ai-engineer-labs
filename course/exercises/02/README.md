# 02 · Costs, setup and shutdown before anything is created

*Module 0 · Welcome · step 2 of 2 · Track: TypeScript*

## Concept

Modules 0–2 cost nothing: everything runs on your machine. From Module 3 the course creates **real, billable Azure resources**, because some things (a real index, the semantic ranker, an indexer pulling from Blob storage) cannot be faked honestly. This step explains the money and the safety rails *before* anything exists, so that you decide when resources exist and you can prove when they are gone.

```text
plan (read-only) ──► up (type "create") ──► work ──► down (type the group name) ──► verify (sweep) ──► banner clears
       │                                                                                    │
       └── live list prices, region and model checks                                       └── only a clean sweep of the
                                                                                               recorded subscription clears it
```

## Theory

**What gets created, and how it is charged.** The paid steps create one resource group tagged `course=senior-ai-engineer-labs` containing:

- **Azure AI Search, Basic tier, one search unit.** A dedicated service is billed **every hour it exists**, used or not. Microsoft is explicit that a dedicated service runs continuously: to stop billing you must delete it. There is no pause.
- **Azure OpenAI** with an embedding and a chat deployment, billed **per token**. The course sends a small number of tokens.
- Role assignments for you, which are free. API keys are disabled; calls use your Microsoft Entra ID token.

So the cost model is `search units × hours × hourly rate + tokens × token prices`. The hours term dominates: forgetting to shut down over a weekend costs far more than every token the labs send. The course never hard-codes a price. `npm run azure:prices` and `azure:plan` read **live list prices** for your region from the public Azure Retail Prices API; your agreement may differ.

**Why not the Free tier?** Free is a shared service with 50 MB of storage, one per subscription, no scaling, and it can be deleted after long inactivity. It also lacks managed identities, which keyless designs use. Microsoft's own try-for-free guidance recommends Basic for quickstarts. Serverless exists too, with consumption billing; it cannot be converted to or from the dedicated tiers, so the course stays on one model.

**Budget alerts are not caps.** An Azure budget sends a notification; it does not stop spending. Stopping the workshop, closing your laptop or deleting `course/.azure/` does not stop charges either. Only deleting the resources does.

**The cost banner fails closed.** It is driven by marker files in `course/.azure/`:

| Marker | Meaning | Banner |
|---|---|---|
| `env.json` | set-up finished; resources exist | "Lab 03 Azure resources exist" |
| `resources-may-exist.json` | set-up or shutdown did not finish, or a check found resources | "Paid … resources may exist" |
| `cost-status-unknown.json` | a check failed or the subscription is unclear | "Cost status unknown" |

When several apply, the least certain one matters most. A copy of the record outside the course folder, watched by the `azure-cost-watch` sidecar, brings the banner back if `course/.azure/` is deleted. **Only** `azure:verify` can clear it, and only when it swept the **recorded** subscription without errors and found no course-tagged groups, resources or soft-deleted accounts. A failed list call is not an empty list, and a clean sweep of a different subscription proves nothing.

**Typed confirmations.** Set-up asks you to type `create`; shutdown asks for the resource group name. They must match exactly. This guards against accidents and automated input, not against a program that deliberately imitates you.

## Check questions

```question
prompt: You finished a paid step on Friday and closed the workshop. Are you still being charged on Saturday?
options:
  - No, closing the workshop stops all charges
  - Only for tokens, because nothing is calling the model
  - Yes, the Basic search service is billed every hour it exists until it is deleted
answer: Yes, the Basic search service is billed every hour it exists until it is deleted
explanation: >-
  A dedicated Azure AI Search service is always running and billed per search unit per hour, whether or not you query
  it. Token charges stop when you stop calling the model, but the hourly charge only stops when the service is
  deleted. That is why the course shuts down by deleting the whole resource group and then verifies.
```

```question
prompt: You set an Azure budget of 10 in your currency. What happens when spending reaches it?
options:
  - Azure stops the resources in the subscription
  - Azure sends an alert; resources keep running and keep costing money
  - Azure deletes the most expensive resource
answer: Azure sends an alert; resources keep running and keep costing money
explanation: >-
  Budgets in Cost Management are notifications, not spending caps. Treat them as a smoke alarm. The fire
  extinguisher is a shutdown you have tested and a verification that proves nothing remains.
```

```question
prompt: azure:verify swept subscription B and found nothing, but set-up recorded subscription A. Should the banner clear?
answer: No. A clean sweep of the wrong subscription proves nothing about where the resources were created.
explanation: >-
  The question the banner answers is "is anything from this course still billing me?". Only a sweep of the
  subscription that set-up recorded, without errors, that finds no groups, resources or soft-deleted accounts
  answers it. Clearing on a sweep of the wrong subscription is the classic false all-clear.
```

```question
prompt: Why does the banner show "Cost status unknown" when a status check fails, instead of hiding itself?
answer: Because failing open would show "all clear" exactly when you cannot see the subscription, which is when you most need the warning.
explanation: >-
  A safety signal should fail closed. A sign-in expiry, a permission error or a network failure tells you nothing
  about what exists. Showing "unknown" keeps you prompted to sign in and verify, rather than trusting silence.
```

```question
prompt: Why is the search cost estimated as units × hours × rate rather than per query?
answer: On the dedicated tiers you pay for provisioned capacity per hour, not per query, so idle hours cost the same as busy ones.
explanation: >-
  Microsoft documents that dedicated services are not billed per query; the tier and search units determine an
  hourly rate. Serverless is different, billing compute units by complexity and index size, which is one reason to
  choose the pricing model deliberately.
```

## Hands-on

Implement the decisions behind the course's cost rails in `index.ts`. The test rates are illustrative numbers for arithmetic, not prices.

- `estimate(plan, rates)` returns the search cost (`units × hours × searchUnitHour`), the token cost (input and output priced per million) and the total, each rounded to the cent. Reject negative or non-finite plan values.
- `hoursWithinBudget(budget, units, rates)` returns the whole hours of search cost that fit in a budget.
- `bannerFor(files)` returns no banner, or a danger banner whose reason is `unknown`, `may-exist` or `exists`, choosing the least certain state present.
- `canClearBanner(result)` returns true only for an error-free sweep of the recorded subscription that found no groups, resources or soft-deleted accounts.
- `confirmed(expected, typed)` matches exactly, allowing one trailing newline.

Optional and free: run `npm run azure:prices` to see live list prices for the configured region. It needs no sign-in and creates nothing.

## Recap and next

You can estimate what the paid steps cost, you know that only deletion stops the hourly charge, that budgets do not cap spending, and that the banner clears only after a clean verify of the right subscription. **Next:** Module 1 starts the search foundations: why an AI system needs retrieval at all.

## Further reading

- [Plan and manage costs of an Azure AI Search service](https://learn.microsoft.com/en-us/azure/search/search-sku-manage-costs)
- [Choose a pricing model and service tier](https://learn.microsoft.com/en-us/azure/search/search-sku-tier)
- [Try Azure AI Search for free](https://learn.microsoft.com/en-us/azure/search/search-try-for-free)
- [Service limits in Azure AI Search](https://learn.microsoft.com/en-us/azure/search/search-limits-quotas-capacity)
- [Azure Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)
- Lesson 17 (real Azure set-up), in this course
