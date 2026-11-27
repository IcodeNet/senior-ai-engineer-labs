# 15 · Regression gates in CI

## Why it matters
Evaluations only protect quality if they can **stop a merge**. A regression gate compares the current run with a stored **baseline** and fails the build when a metric crosses a limit:

- **Absolute limits** — Recall@5 must never fall below 0.75; P95 latency must stay under 2,500 ms.
- **Tolerance** — no metric may worsen by more than an agreed amount against the baseline, even while above its floor. This catches slow erosion.
- **Direction** — quality metrics are better when higher; latency and cost are better when lower.
- **Missing metrics fail.** A metric that silently disappears from the report must not pass.
- **The baseline ratchets.** Update it only from a passing run, so a regression can't become the new normal by accident.

Compare floating-point values with a small epsilon: `0.82 − 0.77` is not exactly `0.05` in binary arithmetic.

## Interview question
> Your gate fails a PR because NDCG@5 fell 0.01 below tolerance on 50 queries. The author says it's noise. How do you design gates that are strict without being flaky?

Think about: tolerances sized from bootstrap intervals (step 14), larger evaluation sets, and reporting versus blocking for noisy metrics.

## Your task
Implement in `index.ts`, using `EPSILON` for every comparison:

- `evaluateGate(baseline, current, rules)` — for each rule, in order, report the **first** failing check:
  1. `"<metric>: missing from the current run"` (status `"missing"`);
  2. higher-is-better: `"<metric>: <current> is below the floor <floor>"`; lower-is-better: `"<metric>: <current> is above the ceiling <ceiling>"`;
  3. with a baseline value and `tolerance`: `"<metric>: fell from <baseline> to <current> (tolerance <tolerance>)"` or `"<metric>: rose from … to … (tolerance …)"` for lower-is-better;
  4. otherwise `"<metric>: ok"` (status `"pass"`).
  Numbers are printed with `format` (provided). Return `{ passed, results }`.
- `ratchetBaseline(baseline, current, gate, rules)` — throw `Error("cannot update the baseline from a failing run")` when the gate failed; otherwise return a copy of `baseline` with every ruled metric set to its current value.

## Going further
Publish the gate as a job summary table, keep baselines per branch or release, and record the dataset and index versions with each baseline.
