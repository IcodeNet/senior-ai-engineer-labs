# 37 · Release safety: canary, shadow and rollback

## Why it matters
A new prompt, model version or retriever passed the offline evaluation and the CI gate (step 15). Production traffic is still different: new phrasings, peak load, provider behaviour. Release safety limits how many users a bad change can hurt and makes rollback a **decision from metrics**, not an argument in a channel.

- **Shadow evaluation** — send a copy of real requests to the candidate, return only the baseline's answer, and compare. No user sees the candidate. Compare things you can check automatically: did both answer or both abstain, and did they cite the same documents? Wording differs harmlessly; a citation to a superseded document does not. Shadowing doubles model cost for the sampled traffic, and the candidate must not trigger side effects (tool calls, emails).
- **Canary** — route a small, growing share of users (1% → 5% → 25% → 50% → 100%) to the candidate. Assignment must be **sticky** (hash the user ID, not a random draw per request) so a user does not flip between versions mid-conversation, **monotonic** so users already in the canary stay in it as the share grows, and **salted per release** so each release tries a different slice of users — with one fixed salt the same 1% would absorb every bad release.
- **Guardrails and a rollback decision** — compare canary with baseline over the same period: error rate, P95 latency, groundedness (from an online judge on a sample, Lab 02) and cost per query. Hold until there is enough traffic — and enough **judged** answers, since groundedness comes from a sample — for the numbers to mean something, except for **safety violations**, where one is enough to roll back. The error-rate guardrail here is absolute: 0.5% → 1.4% is almost three times worse yet passes a one-point limit, so production policies usually add a relative limit too.

All metrics in the tests are synthetic.

## Interview question
> Your canary of a new model shows groundedness down 1.5 points on 600 requests, latency down 30% and cost down 40%. Product wants to promote today. What do you decide, and what would change your mind?

Think about: whether 600 requests (and how many judged) can detect a 1.5-point change (step 14's paired bootstrap), the agreed policy thresholds, segment-level regressions (one tenant or one document type), and the cost of waiting.

## Your task
Implement in `index.ts`:

- `bucketOf(key)` — FNV-1a 32-bit: start at `0x811c9dc5`; for each UTF-16 code unit, XOR it in, then `Math.imul(hash, 0x01000193) >>> 0`; return `hash % 100`.
- `assignVariant(userId, canaryPercent, releaseId)` — `"canary"` when `bucketOf("<releaseId>:<userId>") < canaryPercent`, else `"baseline"`; `RangeError` outside 0–100; throw if `releaseId` is empty.
- `shadowAgreement(pairs)` → `{ agreement, disagreements }` — `"abstain-mismatch"` when kinds differ; `"citation-mismatch"` when both answered with different **sets** of citations; `agreement` is the share without a disagreement. `RangeError` for no pairs.
- `rolloutDecision(baseline, canary, policy)`:
  1. `canary.safetyViolations > 0` → `{ action: "rollback", reasons: ["safety-violations"] }`;
  2. `canary.requests < minRequests` adds `"insufficient-traffic"` and `canary.judgedSamples < minJudgedSamples` adds `"insufficient-judged-samples"`; either → `{ action: "hold", reasons }`;
  3. collect, in this order: `"error-rate"` if canary error rate − baseline error rate > `maxErrorRateIncrease`; `"latency"` if canary P95 > baseline P95 × (1 + `maxLatencyIncrease`); `"groundedness"` if baseline − canary groundedness > `maxGroundednessDrop`; `"cost"` if canary cost per query > baseline × (1 + `maxCostIncrease`). Any reason → `"rollback"`; none → `{ action: "promote", reasons: [] }`.
- `nextCanaryPercent(current, action)` — the next entry of `ROLLOUT_STAGES` on promote (100 stays 100), unchanged on hold, 0 on rollback; `RangeError` if `current` is not a stage.

## Going further
Replace the fixed thresholds with confidence intervals (step 14) so small canaries do not promote on noise, add per-tenant guardrails, and automate the loop: evaluate every 15 minutes, advance or roll back, and record each decision with its metrics as release evidence. Make rollback a configuration flip (model deployment name, prompt version) that does not need a deploy.
