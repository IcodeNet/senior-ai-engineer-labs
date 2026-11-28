# 21 · Evaluate on Azure, then shut down

> **Cost notice.** The live tests in this step call real, billable Azure resources created by the **Set up Azure** action (lesson 17). Azure AI Search Basic is charged for every hour it exists; Azure OpenAI is charged per token. The red cost banner shows while anything may exist. When you finish the lab, run **Shut down Azure** and then **Verify cost is zero** from the Actions tab (lesson 21; terminal: `npm run azure:down`, `npm run azure:verify`). Without Azure set up, the live tests are skipped and the offline tests still check your code.

## Why it matters
"Semantic search feels better" is a hypothesis. With the labelled set (step 09) and harness (step 10) you can measure each mode on the same queries against the real service — and then make a decision a reviewer can check.

Expect differences such as keyword search winning on `ERR-4021` while vector and semantic win on paraphrased questions. With ten queries, treat differences as indicative, not significant (step 14): a real decision needs a larger labelled set.

The final engineering duty is **cleanup**. Azure AI Search Basic keeps charging every hour until it is deleted; stopping your laptop does not stop the bill.

## Interview question
> Leadership asks for one number proving the move to semantic hybrid search was worth it. What do you report, and what caveats do you insist on?

## Your task
Implement in `index.ts`:

- `compareModes(cases, retrievers, k = 5)` — evaluate every mode in `retrievers` (in its key order) with `evaluateRetriever` and return each mode's mean scores.
- `bestMode(results, metric)` — the mode with the highest value of `metric`, keeping the first on ties; throw `RangeError` when there are no results.
- `formatTable(results, k)` — header `| Mode | Recall@k | Precision@k | MRR | NDCG@k |`, a `|---|…` separator, then one row per mode with values to two decimal places.

The live test prints the comparison table for the real index.

## Shut down — required
When the live test has passed and you have read the results, open the **Actions** tab, group **Lab 03 · Real Azure**:

1. **Shut down Azure (delete everything)** (terminal: `npm run azure:down`). It lists every resource in the course resource group, then a dialog asks you to type the group name, `rg-saiel-course-<6 hex>`. The script then:
   - refuses to touch a group that is not tagged `course=senior-ai-engineer-labs`;
   - deletes the whole resource group (Azure AI Search, the Azure OpenAI account and its deployments, and the role assignments scoped to them). This takes several minutes;
   - purges the soft-deleted Azure OpenAI account. Deleted Azure OpenAI (Cognitive Services) accounts are kept in a soft-deleted state for a retention period. Purging frees the name, and nothing of the account remains;
   - removes `course/.azure/env.json`, then runs Verify.
2. **Verify cost is zero** (terminal: `npm run azure:verify`). It checks the subscription for the resource group, any resource tagged `course=senior-ai-engineer-labs` and soft-deleted accounts from the course group. Only when all three are empty does it print `✔ Verified: no course resources remain … This course incurs no further charges.` and clear the cost banner.

Together these remove **every paid resource** the course created: nothing billable lives outside the resource group. Cancelling the dialog deletes nothing, and charges continue.

### If Verify finds leftovers
Verify lists what remains and the "may exist" banner stays. In order:

1. **Run Shut down Azure again.** A deletion that was interrupted, cancelled or timed out usually finishes on the second run.
2. **Delete the tagged resource group yourself**, in the [Azure portal](https://portal.azure.com) under Resource groups → `rg-saiel-course-…` → Delete resource group, or from a terminal:

   ```sh
   az group list --tag course=senior-ai-engineer-labs -o table     # find it
   az group delete --name rg-saiel-course-<6 hex> --yes
   az resource list --tag course=senior-ai-engineer-labs -o table  # anything tagged outside the group
   ```
3. **Purge soft-deleted Azure OpenAI accounts.** List them and purge the course one:

   ```sh
   az cognitiveservices account list-deleted -o table
   az cognitiveservices account purge --location <location> --resource-group rg-saiel-course-<6 hex> --name oai-saiel-<suffix>
   ```
   In the portal, this is Azure AI services → Manage deleted resources.
4. Run **Verify cost is zero** again until it passes.

If Verify reports **Cost status unknown** instead, it could not check. You are signed out, `az` is missing, or a different subscription is selected (it names the subscription the resources were created in: `az account set --subscription <id>`). Fix that and verify again. The banner never clears on a failed check.

**Budget alerts do not cap spend.** A budget only emails you; resources keep billing until they are deleted. Stopping Icode, shutting your laptop or the `expiresAt` tag passing does not delete anything either. Only a passing Verify tells you the course costs nothing further.
