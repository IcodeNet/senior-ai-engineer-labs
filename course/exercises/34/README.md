# 34 · Rate limits and token budgets per user

## Why it matters
One script hitting the assistant in a loop can exhaust the deployment's tokens-per-minute quota for every analyst in the bank, and one user pasting 200-page prospectuses all day can double the monthly bill. Providers limit you per deployment; **you** must limit per user (or per tenant, per API key) so cost and capacity are shared fairly and abuse is contained.

Two complementary controls:

- **Rate limiting with a token bucket** — each user's bucket holds up to `capacity` tokens and refills continuously at `refillPerSecond`. A request spends `cost` tokens (1 per request, or more for expensive ones). Bursts up to capacity are allowed; sustained load is capped at the refill rate. A denied request gets `retryAfterMs`, which maps to HTTP 429 with a `Retry-After` header.
- **Token budgets** — a daily allowance of model tokens per user. Before calling the model, **reserve** the input tokens plus the output you will allow, and pass the granted amount as the model's maximum output tokens so the call physically cannot overspend. Afterwards **settle** with the provider's reported usage, refunding the unused part. Open reservations count against the budget, so concurrent requests cannot jointly exceed it.

`estimateTokens` (about four characters per token in English) is only for planning; real counts come from the tokenizer or the provider's `usage` field. Budget periods use the **UTC** day so they do not shift with time zones or daylight saving.

These classes keep state in memory for a single process. Across many instances the same algorithms run against a shared store such as Redis with atomic operations, or at an API gateway (Azure API Management has token-limit policies for Azure OpenAI).

## Interview question
> Finance wants a hard monthly cap on model spend per business unit, and the head of trading wants their desk never to be throttled. How do you design limits that satisfy both?

Think about: per-tenant and per-user budgets, priority tiers, reserved capacity (provisioned throughput), what happens when a budget runs out mid-day (smaller model, cached answers, a clear message), and alerting before the cap.

## Your task
Implement in `index.ts`:

- `estimateTokens(text)` — `ceil(length / 4)`.
- `TokenBucket.take(key, cost = 1)` → `{ allowed, remaining, retryAfterMs }` — a new key starts full; refill by `elapsedMs / 1000 × refillPerSecond`, capped at capacity; if there are at least `cost` tokens, spend them (`retryAfterMs: 0`); otherwise deny with `retryAfterMs = ceil((cost − tokens) / refillPerSecond × 1000)`. `remaining` is `floor` of the tokens left. Throw `RangeError` if `cost` is not between 1 and `capacity`.
- `TokenBudget.remaining(userId)` — `dailyLimit` minus settled usage minus open reservations for that user's current UTC day, never below 0.
- `TokenBudget.reserve(userId, inputTokens, requestedOutputTokens)` — grant `maxOutputTokens = min(requested, remaining − inputTokens)`; if that is below 1 return `{ ok: false, reason: "budget-exceeded", remaining }`; otherwise hold `inputTokens + maxOutputTokens` and return `{ ok: true, id: "<userId>#<n>", maxOutputTokens }`, where `n` counts reservations from 1.
- `TokenBudget.settle(id, actualTokens)` — close the reservation and add the actual usage to the day it was reserved on; throw an `Error` mentioning "unknown or already settled" otherwise.

## Going further
Expire reservations that are never settled (a crashed request), add per-tenant budgets above per-user ones, and alert at 80% of a budget. Compare token bucket with sliding-window limits for fairness and memory.
