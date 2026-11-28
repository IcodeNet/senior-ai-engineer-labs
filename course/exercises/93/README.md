# 93 · Build vs buy and model selection scorecards

## Why it matters
"Which model (or vendor, or self-hosted stack) should we use?" gets decided in meetings by whoever argues loudest — unless someone brings a **weighted scorecard** and shows how robust the answer is.

1. **Hard constraints first.** Data residency, contractual terms or a security certification are not trade-offs: an option that fails one is **eliminated**, however good its scores. Weighting them would let a great score buy its way past a compliance requirement.
2. **Normalise** each criterion across the remaining options with min-max scaling so units (pence, milliseconds, accuracy) are comparable; invert "lower is better" criteria; a criterion where everyone ties gives everyone 1. Min-max scaling has two known weaknesses: it **stretches small gaps** (quality 0.80 vs 0.90 becomes 0 vs 1), and it causes **rank reversal** — adding or removing an option, including by elimination, changes every score and can reorder the others. When the scorecard must be auditable over time, prefer **fixed reference scales** agreed in advance (for example quality 0.5 → 0, 1.0 → 1; cost £0 → 1, £20 → 0).
3. **Weight** and sum. Weights encode priorities, so agree them *before* seeing the scores and normalise them to sum to 1.
4. **Sensitivity.** Nudge each weight up and down by a fraction and see whether the winner changes. A decision that flips when "quality" matters 30% more is a decision to discuss openly, not to present as obvious.

Values in the tests are illustrative, not benchmarks or prices. Real inputs come from your own evaluation (Module 7) and verified pricing.

## Interview question
> Your team must choose between a frontier hosted model, a small hosted model and a self-hosted open-weights model for a client-facing assistant in an EU bank. How do you make and defend the decision?

## Model answer outline
- Gate on non-negotiables: data residency and processing terms, security review, availability in the required region, licence.
- Criteria from requirements: task quality on *our* labelled set, cost at forecast volume (step 89), P95 latency (step 88), operability (on-call, upgrades, GPUs), vendor lock-in and exit cost.
- Weighted scorecard with agreed weights; show raw values next to normalised ones so the numbers are auditable.
- Sensitivity analysis: name the weight changes that flip the winner; if the decision is fragile, gather better data on that criterion (bigger eval set, real latency tests).
- Build vs buy: buying wins on time-to-value and operations; building wins when control, residency or unit cost at scale dominate. Revisit at a set date; design an abstraction so switching is cheap.

## Your task
Implement in `index.ts`:

- `normaliseWeights(criteria)` → weights by name summing to 1; throw `RangeError` for a negative weight or when all are zero.
- `scoreOptions(options, criteria)` → `{ ranking, eliminated, winner }`:
  - an option is eliminated at the first criterion (in order) whose raw value is below `min` (`"below-min"`) or above `max` (`"above-max"`);
  - normalise each criterion over eligible options: `(v − low) / (high − low)`, inverted for `lower-is-better`, and 1 for everyone when `high === low`;
  - score = Σ normalised weight × normalised value; ranking highest first (ties by name); `winner` is the top name or `null`;
  - throw `Error("option <name> has no value for <criterion>")` for a missing value.
- `sensitivity(options, criteria, change = 0.2)` → `{ baseWinner, robust, flips }`: for each criterion in order, multiply its weight by `1 + change` (`"increase"`) then `1 − change` (`"decrease"`), re-score, and record each changed winner. Throw `RangeError` unless `0 < change < 1`.

## Going further
Replace point estimates with ranges (best/worst case per value), compute the weight at which the winner flips exactly, and record the scorecard as an ADR in `docs/architecture/`.
