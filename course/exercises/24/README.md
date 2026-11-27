# 24 · Tool errors, retries and idempotency

## Why it matters
Tools call networks, and networks fail. Two questions decide whether a failure is harmless or a production incident:

1. **Is it worth retrying?** Timeouts and 503s (*transient*) and 429s (*rate-limited*) usually are; validation errors (*invalid*) and business refusals (*permanent*) never are — retrying them wastes budget and hides bugs. An exception you do not recognise is not retryable by default.
2. **Is it safe to retry?** Reading an FX rate twice is harmless. Issuing a refund twice is not. A timeout does not tell you the request failed: the server may have committed the refund and lost the response. Retrying blindly pays twice.

The fixes are standard distributed-systems practice applied to agents:

- **Capped exponential backoff** (`base × 2^(n−1)`, at most `max`), honouring `Retry-After` on rate limits. Production adds jitter so clients do not retry in lockstep; it is left out here so tests are exact.
- **Idempotency keys.** Derive a key from the run, the tool and the *canonical* arguments, send it to the downstream API (as payment providers' `Idempotency-Key` headers do) and keep the result. The same logical call — a retry, or the model repeating itself — returns the stored result instead of acting again.
- **Canonical serialisation.** `{amount, claimId}` and `{claimId, amount}` are the same call; sort keys before hashing.

Agents add one twist: the *model* can also repeat a side-effecting call on a later turn. A key scoped to the run catches that; a key scoped to the business object (the claim ID) catches it across runs.

Time is injected (`sleep`), so tests run instantly and deterministically.

## Interview question
> An agent issued the same £120 refund twice after a payments API timeout. Walk through the root cause and the fix, at the tool, the agent loop and the downstream API.

## Your task
Implement in `index.ts` (`ToolError` and the types are provided):

- `isRetryable(error)` → `true` only for a `ToolError` of kind `transient` or `rate-limited`.
- `backoffDelay(failedAttempt, { baseDelayMs, maxDelayMs }, error?)` → `min(maxDelayMs, baseDelayMs × 2^(failedAttempt−1))`; for a `rate-limited` `ToolError` with `retryAfterMs`, the larger of that and the computed delay.
- `withRetry(operation, policy, sleep)` → call `operation(attempt)` (1-based) until it resolves, returning `{ value, attempts }`. Rethrow the original error immediately if it is not retryable, or after `maxAttempts` attempts; otherwise `await sleep(backoffDelay(attempt, policy, error))` and try again.
- `stableStringify(value)` → JSON with object keys sorted at every level, array order kept, `undefined` properties dropped.
- `idempotencyKey(runId, toolName, args)` → `<runId>:<toolName>:<first 16 hex characters of sha256(stableStringify(args))>`.
- `idempotent(toolName, runId, store, execute)` → a function `(args) => { value, replayed }`: if the store has the key, return its value with `replayed: true` without executing; otherwise call `execute(args, key)`, store `{ value }` **only on success**, and return `replayed: false`.

## Going further
`stableStringify` is designed for arguments parsed from JSON: it does not handle `Date`, `Map`, `undefined` inside arrays (printed as `undefined`, where JSON uses `null`) or cyclic objects, so canonicalise non-JSON values before hashing. `Retry-After` is honoured without a cap here; in production cap it against the caller's deadline and give up instead of sleeping past it.

Store a pending marker before executing so two concurrent calls with the same key cannot both run; expire keys; add a circuit breaker so a dead dependency fails fast; and record retries in your traces so you can see when a "fast" tool is slow because it is retrying.
