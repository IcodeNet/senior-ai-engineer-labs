# 36 · Observability: traces, token attributes and safe logs

## Why it matters
"The assistant is slow" and "the bill doubled" (step 08's interview question) are only answerable if every request leaves a **trace**: a tree of **spans**, one per stage — retrieve, rerank, each model call, validation — with timings and attributes. With traces you can see that P95 is dominated by a second model call, or that one tenant sends 8,000-token prompts.

- A **trace** is one request; each **span** has a `traceId`, its own `spanId`, the `parentSpanId` of the stage that called it, start/end times and a status.
- Model calls carry token counts and the model name. Use the **OpenTelemetry GenAI semantic conventions** (`gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`) so any backend — Azure Monitor / Application Insights, Jaeger, Grafana — understands them.
- Errors are recorded on the span by **type**, not by message (messages often echo inputs).

Telemetry is also the most common place sensitive data leaks: prompts, completions, request headers and customer identifiers end up in a log store with broad read access and long retention. **Structured logs** with an **allow-list** are the safe default: only named fields are written; user IDs are **pseudonymised** with **HMAC-SHA-256 and a secret key** (kept in a key vault, never in code or logs) so you can still count and correlate per user without storing the identity; emails, IBAN-like strings and long digit runs in free text are masked; long strings are truncated. Why HMAC and not a salted hash: user IDs come from a small, guessable space, so anyone who reads the logs and knows the salt can hash every candidate ID and reverse the mapping; without the key they cannot. Pseudonymised data is still **personal data** under GDPR — it reduces risk, it does not remove obligations. Dropped field *names* are recorded so missing data is visible, without their values.

The tracer here is a tiny stand-in for the OpenTelemetry API with an injected clock and ID generator, so the tests are deterministic.

## Interview question
> An auditor asks you to prove which documents and model version produced a specific answer six months ago, and your privacy officer says prompts must not be retained. How do you design telemetry that satisfies both?

Think about: logging document IDs and versions rather than text, prompt and model versions as attributes, pseudonymous user IDs with a managed HMAC key, separate retention for audit events and debug traces, and sampling.

## Your task
Implement in `index.ts`:

- `createTracer({ now, newId })` → `{ startSpan, finished }`. `startSpan(name, { parent, attributes })` takes the parent's `traceId` or a new ID (generated before the span ID), a new `spanId`, and `startMs = now()`. A span's `setAttribute` is ignored after it ends; `recordError(error)` sets status `"error"` and `error` to the error's `name`; `end()` records `{ traceId, spanId, parentSpanId?, name, startMs, endMs, durationMs, status, error?, attributes }` once (omit `parentSpanId` and `error` when absent). `finished()` returns records in the order spans ended.
- `withSpan(tracer, name, parent, fn)` — start a child span, `await fn(span)`, record the error and rethrow on failure, always end the span.
- `summariseTrace(spans, traceId)` → `{ totalMs, inputTokens, outputTokens, llmCalls, slowestChild, errors }` for that trace only: `totalMs` is the root span's duration (throw "no root span" if missing); tokens are summed from the `GEN_AI` attributes; `llmCalls` counts spans with a model attribute; `slowestChild` is the name of the longest non-root span.
- `pseudonymise(value, key)` — the first 16 hex characters of HMAC-SHA-256 of `value` keyed with `key` (`createHmac` from `node:crypto`); throw if the key is empty.
- `safeLogRecord(event, fields, { allow, pseudonymise, key, maxLength = 200 })` — start with `{ event }`; pseudonymise string fields listed in `pseudonymise`; copy allow-listed numbers and booleans; copy allow-listed strings through `maskFreeText` (given: `[EMAIL]`, `[IBAN]`, `[NUMBER]`), then truncated to `maxLength`; drop everything else (including allow-listed objects) and, if anything was dropped, add `droppedFields` with the sorted names joined by commas.

## Going further
Replace the stand-in with `@opentelemetry/api` and export to Application Insights, add tail-based sampling that keeps every error and slow trace, and emit per-tenant cost metrics from the token attributes (step 16). Rotate the HMAC key and document how that breaks correlation across the rotation. Use step 31's full detector instead of `maskFreeText` for free text.
