# 13 · Calibrating the judge against humans

## Why it matters
An LLM judge is a measuring instrument; before trusting its numbers, measure the instrument. Have humans label a sample (say 100 answers), run the judge on the same sample, and compare:

- **Exact agreement** — share of identical scores. Easy to read, but inflated when most answers get the same score.
- **Within-one agreement** — share of scores at most one point apart.
- **Cohen's κ** — agreement corrected for chance: `κ = (pₒ − pₑ) / (1 − pₑ)`, where `pₒ` is exact agreement and `pₑ = Σ over scores of P(human = s) × P(judge = s)`. A judge that gives everyone 5 can agree 80% of the time and still have κ = 0. Rough guide: above 0.6 is substantial, above 0.8 almost perfect.
- **False-pass rate** — of the answers humans **failed**, the share the judge passed. In regulated domains this is the number that matters most: it is how often bad answers would slip through your quality gate.

## Interview question
> Your judge agrees with reviewers 85% of the time. Is it good enough to gate releases? What else do you need to know?

## Your task
Implement in `index.ts` (each takes parallel arrays of integer scores; throw `RangeError` if they are empty or of different lengths):

- `exactAgreement(human, judge)` and `withinOne(human, judge)`.
- `cohensKappa(human, judge)` — if `pₑ` is 1, return 1 when `pₒ` is 1, otherwise 0.
- `falsePassRate(human, judge, passThreshold)` — scores `>= passThreshold` pass; return 0 when humans failed nothing.
- `calibrate(human, judge, { passThreshold = 4, minKappa = 0.6, maxFalsePass = 0.1 })` → `{ n, exact, withinOne, kappa, falsePass, trusted }`, where `trusted` is `kappa >= minKappa && falsePass <= maxFalsePass`.

## Going further
Recalibrate whenever the judge model, rubric or answer distribution changes; report confidence intervals for small samples (step 14) and review disagreements to improve the rubric.
