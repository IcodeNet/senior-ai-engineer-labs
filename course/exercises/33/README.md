# 33 · Resilience: timeouts, retries, circuit breaker, fallback

## Why it matters
Model endpoints throttle (HTTP 429), overload (503) and occasionally hang. An assistant used by a trading desk at market open cannot wait 60 seconds for a socket timeout, and a naive retry loop turns one provider incident into a self-inflicted outage. Four patterns, applied in this order from the inside out:

- **Timeout** — every call has a deadline, and the underlying request is **aborted** (an `AbortSignal`) so it stops consuming resources.
- **Retry with jittered exponential backoff** — only for **transient** errors (timeouts, 408, 429, 5xx). Never retry 400/401/403/404/422: they will fail again. **Full jitter** (`random() × min(cap, base × 2^attempt)`) spreads retries so thousands of clients do not hammer the provider in lock-step. Honour `Retry-After` when the provider sends it (Going further).
- **Circuit breaker** — after N consecutive **dependency** failures (timeouts, refused connections, resets, 429, every 5xx including a 501 or 505 that is not worth retrying — anything except a real 4xx response caused by the caller, or one client sending malformed requests would cut everyone off) stop calling the dependency for a cooldown and **fail fast**; then allow a trial call (*half-open*). Success closes the circuit; failure re-opens it.
- **Fallback** — degrade honestly: a smaller model, a cached answer, or "here are the relevant documents" — and mark the response as **degraded** so it is visible to users and in metrics.

Retries multiply cost and latency: three retries on a 10 s timeout is a 40 s worst case, plus the backoff sleeps. Set the total budget first. And only retry operations that are safe to repeat — a model completion is; a payment instruction triggered by a tool call is not without an idempotency key.

Clocks, randomness and sleeps are injected, so the tests are deterministic and instant.

## Interview question
> Your provider returns 429s for ten minutes at 09:00 every day. Users see spinners, then errors, and the bill shows more requests than users sent. What is happening and what do you change?

Think about: retry storms and jitter, rate limits per deployment, provisioned throughput, a circuit breaker with a fallback model or region, and step 34's per-user limits.

## Your task
Implement in `index.ts`:

- `withTimeout(op, ms)` — call `op(signal)`; if it has not settled after `ms`, abort the signal and reject with `TimeoutError`. Clear the timer either way.
- `isCallerError(error)` — `true` only for an `HttpError` with status 400–499 that is not 408 or 429.
- `isRetryable(error)` — `true` for `TimeoutError` and for `HttpError` with status 408, 429, 500, 502, 503 or 504; otherwise `false`.
- `backoffDelay(attempt, { baseMs, maxMs, random })` — `floor(random() × min(maxMs, baseMs × 2^attempt))`.
- `retry(op, options)` — call `op(attempt)` with attempt 0, 1, …; on an error that is retryable (`options.isRetryable`, default `isRetryable`) and while `attempt < retries`, `await sleep(backoffDelay(attempt, options))` and try again; otherwise rethrow.
- `CircuitBreaker` — `state()` is `"closed"` until opened, `"open"` during the cooldown, `"half-open"` once `now() − openedAt ≥ cooldownMs`. `call(op)` throws `CircuitOpenError` without calling `op` when open; an error counts as a failure if `isFailure(error)` is true, and the default treats **every** error as a failure **except** `isCallerError` — an `HttpError` with status 400–499 other than 408 and 429. Network errors (`TypeError("fetch failed")` on connection refused or DNS failure), resets, timeouts, 5xx and bugs all count: only a real 4xx response proves the dependency is up. A success **or a caller error** (which is rethrown) resets the count and closes; a failure increments it and opens (recording `now()`) when it reaches `failureThreshold` or when the failed call was the half-open trial.
- `withFallback(primary, fallback)` → `{ value, degraded: false }` or `{ value: fallback(error), degraded: true, error: error.name }`.

## Going further
Compose them — breaker around retry around timeout — and add a total deadline across retries. Allow only one concurrent half-open trial, honour `Retry-After`, and emit a metric on every state change (step 36).
