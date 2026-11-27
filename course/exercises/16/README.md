# 16 · Cost and latency accounting

## Why it matters
Quality is only half of an evaluation report; the other half is **what it costs** and **how long users wait**. Model APIs bill per token, usually at different rates for input and output, so long retrieved contexts and verbose answers cost money on every query. Users feel the slowest requests, so report **percentiles** (P50, P95), not just averages.

Record per request: model, input tokens, output tokens and latency. Then compute:

- **cost** = `inputTokens / 1,000,000 × inputPrice + outputTokens / 1,000,000 × outputPrice`;
- **cost per query** and a projected **monthly** cost for expected traffic;
- **P50 / P95 latency** with the nearest-rank method;
- a **budget check** before the bill arrives.

The prices here are placeholders for exercises. Verify current pricing for your model, region and agreement before quoting numbers — prices change, and Azure regions differ.

## Interview question
> After adding hybrid search and a reranker, quality improved 4 points but P95 latency doubled and cost per query rose 60%. How do you present the trade-off and what would you try first?

## Your task
Implement in `index.ts`:

- `requestCost(record, prices)` — throw `Error("no price for model <model>")` if the model is missing; throw `RangeError` for negative or non-integer token counts.
- `percentileNearestRank(values, p)` — sort ascending and return the value at rank `ceil(p / 100 × n)` (1-based, at least 1); throw `RangeError` for an empty list or `p` outside 0–100.
- `summarise(records, prices, { monthlyQueries, monthlyBudget })` → `{ queries, totalCost, costPerQuery, p50Ms, p95Ms, projectedMonthlyCost, withinBudget }`; throw `RangeError` for no records.

## Going further
Attribute cost and time per stage (embedding, search, generation, judge), cache embeddings and frequent answers, and set Azure budget alerts — remembering they notify, they do not cap spending.
