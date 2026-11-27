# 42 · SLOs and error budgets for AI features

## Why it matters
An AI feature can be "up" and still useless: it answers fast, with confident, ungrounded text. So an AI service needs the classic **availability** and **latency** SLOs *and* a **quality SLO** measured on a sample of traffic (groundedness, citation validity, judge pass rate — steps 11–13).

- An SLO is `good events / eligible events ≥ target` over a window. Define *eligible* carefully: latency is measured on served requests (failures already count against availability); quality on evaluated requests only.
- The **error budget** is the bad events you may have: `(1 − target) × eligible`. `budgetRemaining = 1 − bad / allowedBad`; below 0 the SLO is breached, near 0 it is at risk and the team slows down risky changes.
- A quality SLO from a small sample is noise: require a **minimum sample** and report `insufficient-data` rather than a false green or red.
- **Burn rate** = `badFraction / (1 − target)`; a burn rate of 1 spends the budget exactly over the window. Page on **multi-window** burn (a short and a long window both above a threshold such as 14.4) so you catch fast burns without paging on blips.
- A 100% target leaves no budget and forbids change; reject it.

## Interview question
> Leadership wants an SLO for the new AI assistant. What SLOs would you define, how would you measure answer quality in production, and what happens when the quality budget runs out?

## Model answer outline
- Three SLIs: availability (non-error answers / requests), latency (served requests under the threshold, or time-to-first-token), quality (sampled, judge- or rule-evaluated pass rate, with human-calibrated judges).
- Targets from user need and current baseline, over a 28- or 30-day window; publish eligible-event definitions.
- Quality measurement: stratified sampling, minimum sample sizes, judge calibration (step 13), separate refusal/abstention rate so "safe but useless" is visible.
- Error-budget policy agreed in advance: budget exhausted → freeze prompt/model changes, prioritise fixes, roll back the last change; at-risk → extra review.
- Alerting by multi-window burn rate, not by single bad answers; dashboards per stage for diagnosis.

## Your task
Implement in `index.ts`:

- `evaluateSlo(events, slo, atRiskBelow = 0.25)` → `{ name, good, total, bad, compliance, allowedBad, budgetRemaining, status }`:
  - availability: every event, good when `ok`;
  - latency: `ok` events only, good when `latencyMs <= thresholdMs`;
  - quality: `ok` events with a `quality` result, good when `"pass"`;
  - `allowedBad = (1 − target) × total`, `budgetRemaining = 1 − bad / allowedBad` (1 when `allowedBad` is 0), `compliance = good / total` or `null` with no events;
  - status: `insufficient-data` when `total` is 0 or a quality SLO has fewer than `minSamples`; else `breached` when `bad > allowedBad`; else `at-risk` when `budgetRemaining < atRiskBelow`; else `ok`;
  - throw `RangeError` unless `0 < target < 1`.
- `burnRate({ bad, total }, target)` — 0 for an empty window.
- `shouldPage({ short, long }, target, threshold = 14.4)` — true only when both windows' burn rates are at least the threshold.

## Going further
Add a refusal-rate SLI, per-tenant SLOs for a multi-tenant service, and an error-budget policy check that blocks a deployment (step 15) when the quality budget is exhausted.
