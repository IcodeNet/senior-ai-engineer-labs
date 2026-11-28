# 88 · Latency budgets and P95 composition

## Why it matters
A product owner says "answers within 2 seconds at P95". You have to turn that into a budget per stage — retrieval, rerank, generation — and then check reality against it. Two traps catch most people:

- **Percentiles do not add.** The sum of stage P95s is neither an upper nor a lower bound on end-to-end P95. It is **exact** only when slowness is perfectly correlated (the slowest requests are slow in every stage). With independent stages and moderate tails it is usually an **overestimate**, because outliers in different stages rarely hit the same request. It can also be an **underestimate**: if two independent stages each spike on 4% of requests, each stage's P95 is the fast value, yet about 8% of requests contain a spike, so the end-to-end P95 includes it. Compute P95 on **end-to-end** latency from per-request traces.
- **Parallel stages cost their slowest member.** Lexical and vector retrieval run side by side, so a request waits for the slower one; serial groups add up.

Allocate a budget by giving each stage an irreducible **floor** (network round trip, minimum model time) and sharing what remains by **weight**. Then report breaches worst first, so the team knows where to spend effort.

Making per-stage budgets *sum* to the end-to-end target uses exactly the additivity warned about above. Treat it as a deliberately simple heuristic for ownership ("generation owns 1.4 s"): it is usually conservative, but not guaranteed, so the end-to-end P95 from traces remains the number you alert on.

## Interview question
> Your RAG endpoint has a 2-second P95 target. Retrieval P95 is 400 ms, rerank P95 is 300 ms and generation P95 is 1.5 s, yet the measured end-to-end P95 is 1.9 s. Explain the numbers, and how you would allocate and enforce a latency budget.

## Model answer outline
- Stage P95s summing to 2.2 s while end-to-end is 1.9 s is typical, not guaranteed: tail events in different stages rarely coincide. The sum is exact only under perfect correlation and can even underestimate when rare spikes in several stages each sit just inside the 5% tail. Always measure end-to-end from traces with per-stage spans.
- Per-stage budgets that add up to the target are an ownership heuristic, not a guarantee; verify end-to-end.
- Budget: floors for fixed costs, weighted share of the remainder, generation gets the largest share; stream tokens so time-to-first-token is the user-facing latency.
- Enforce with per-stage timeouts and fallbacks (skip rerank when retrieval is slow, return fewer chunks, smaller model) rather than one global timeout.
- Parallelise independent work (lexical ∥ vector, guardrail checks ∥ generation where safe); cap fan-out because the slowest branch sets the latency.
- Track P95 and P99 per stage and end-to-end; alert on end-to-end against the SLO, debug with stage breaches.

## Your task
Implement in `index.ts` (`percentileNearestRank` is provided):

- `endToEndMs(trace, plan)` — sum over serial groups of the maximum stage time within the group; throw `Error("missing stage <name>")` when a stage is absent.
- `endToEndP95(traces, plan)` — nearest-rank P95 of per-request end-to-end times.
- `sumOfGroupP95s(traces, plan)` — the naive estimate: sum of each group's P95 (group time per request = its slowest stage).
- `allocateBudget(totalMs, stages)` — each stage gets `floorMs + remainder × weight / totalWeight`; throw `RangeError("floors exceed budget")` when floors exceed the total, and `RangeError` for no stages, negative weights or floors, or zero total weight.
- `budgetBreaches(allocation, observedP95)` → stages whose observed P95 exceeds their budget, as `{ stage, budgetMs, observedMs, overByMs }`, largest overage first (ties by name); throw `Error("missing stage <name>")` when an allocated stage has no observation.

## Going further
Budget time-to-first-token separately from total time, add hedged requests for the retrieval tail, and model a retry: one retry at P95 can push the request past the P99.
