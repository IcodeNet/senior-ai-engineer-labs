# 87 · Capacity and token-throughput estimation for a RAG service

## Why it matters
"How many model deployments do we need?" is the first question in almost every AI system-design interview, and the first line of a real capacity plan. Model endpoints are rate-limited in **tokens per minute (TPM)** and **requests per minute (RPM)**, so capacity is a token problem, not just a request problem: a RAG prompt with five retrieved chunks is mostly context.

The back-of-the-envelope method:

1. **Tokens per request** = system prompt + query + `chunks × tokensPerChunk` (input) + output.
2. **Average RPS** = daily requests / 86,400; **peak RPS** = average × peak-to-average ratio. Size for the peak.
3. **Peak TPM** = peak requests per minute × tokens per request.
4. **Deployments** = the larger of `ceil(peakTPM / (TPM × utilisation))` and `ceil(peakRPM / (RPM × utilisation))`. Whichever is larger is the **binding constraint**. Plan for headroom (utilisation below 1) because quotas are enforced in short windows and traffic is bursty.
5. **Concurrency** by Little's law: in-flight requests = arrival rate × time in system. It sizes connection pools, worker counts and provisioned throughput.

Limits in the tests are placeholders. Real quotas depend on model, region, deployment type and your agreement; some providers also count the requested `max_tokens` against TPM, so an oversized `max_tokens` wastes quota even when answers are short.

## Interview question
> A RAG assistant must serve 2 million questions a day with a 3× peak hour. Each answer retrieves eight 400-token chunks and writes about 300 tokens. How do you estimate the model capacity you need, and what would you change first if the estimate is too expensive?

## Model answer outline
- State assumptions aloud: prompt and chunk sizes, output length, peak ratio, latency, utilisation target.
- Compute tokens per request (~3.5k input, 0.3k output), average and peak RPS (~23 → ~70), peak TPM, then divide by per-deployment TPM and RPM with headroom; name the binding constraint.
- Use Little's law for concurrency (peak RPS × latency) to size pools and provisioned throughput units.
- Levers, in order of cost/quality impact: fewer or smaller chunks (rerank then keep top 3), prompt caching for the fixed system prompt, a smaller model for easy queries (routing), answer caching for repeated questions, tighter `max_tokens`.
- Risks: input-dominated cost hides in context; peak is set by business events; quotas are per region, so plan failover capacity too.

## Your task
Implement in `index.ts`:

- `tokensPerRequest(profile)` → `{ input, output, total }`; throw `RangeError` for negative or non-integer token fields or chunk counts.
- `estimateCapacity(profile, load, limits)` → `{ inputTokensPerRequest, outputTokensPerRequest, averageRps, peakRps, peakTokensPerMinute, peakRequestsPerMinute, concurrentRequests, deploymentsNeeded, bindingConstraint }`.
  - `deploymentsNeeded` is at least 1; `bindingConstraint` is `"tokens"` when the token limit needs at least as many deployments as the request limit, otherwise `"requests"`.
  - `concurrentRequests` = `ceil(peakRps × meanLatencyMs / 1000)`.
  - Use the provided `ceilSafe` so floating-point dust does not add a deployment.
  - Throw `RangeError` when `peakToAverage < 1`, limits are not positive, or `targetUtilisation` is outside `(0, 1]`.

## Going further
Add per-region failover (N+1 capacity), split traffic between a small and a large model, and compare pay-as-you-go against provisioned throughput at your peak and your average.
