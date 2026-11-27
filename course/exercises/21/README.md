# 21 · Evaluate on Azure, then shut down

> **Cost notice.** The live tests in this step call real, billable Azure resources created by `npm run azure:up`. Azure AI Search Basic is charged for every hour it exists; Azure OpenAI is charged per token. When you finish the lab, run `npm run azure:down` and then `npm run azure:verify`. Without Azure set up, the live tests are skipped and the offline tests still check your code.

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
When the live test has passed and you have read the results:

```sh
npm run azure:down     # type the resource group name to delete it and everything in it
npm run azure:verify   # confirms no course resources remain, so the course costs nothing further
```

`azure:down` only deletes the resource group tagged `course=senior-ai-engineer-labs`, purges the soft-deleted Azure OpenAI account and removes `.azure/`. If `azure:verify` lists anything, run `azure:down` again or remove it in the Azure portal.
