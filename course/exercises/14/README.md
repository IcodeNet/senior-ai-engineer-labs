# 14 · Is it really better? Paired bootstrap comparison

## Why it matters
Mean Recall@5 rose from 0.78 to 0.81 on 60 queries. Real improvement or noise? With small evaluation sets, a few queries flipping can move the mean by several points.

Both systems ran on the **same** queries, so compare them **paired**: compute the per-query difference `candidate − baseline` and ask how much its mean would vary if you had drawn a different sample of queries. The **bootstrap** answers that by resampling the differences with replacement many times and taking the 2.5th and 97.5th percentiles of the resampled means — a 95% confidence interval.

- Interval entirely above 0 → **improved**.
- Entirely below 0 → **regressed**.
- Spans 0 → **inconclusive**: collect more labelled queries before claiming a win.

Use a **seeded** random generator so the same inputs always give the same decision, in CI and on a laptop.

## Interview question
> A teammate's prompt change "improves groundedness by 3 points" on 40 examples. How do you decide whether to ship it?

## Your task
Implement in `index.ts`:

- `pairedDifferences(baseline, candidate)` — per-index `candidate − baseline`; throw `RangeError` if empty or lengths differ.
- `percentile(sorted, p)` — linear interpolation on a sorted array: position `p × (n − 1)`, interpolating between the neighbours.
- `bootstrapMeanCI(values, { iterations = 2000, confidence = 0.95, seed = 42 })` — draw `iterations` resamples of `values.length` items, each index `Math.floor(random() × n)` from `mulberry32(seed)` (provided); return `{ mean, low, high }` with `low`/`high` the `(1 − confidence) / 2` and `1 − (1 − confidence) / 2` percentiles of the sorted resampled means.
- `compareSystems(baseline, candidate, options)` → `{ meanDifference, low, high, decision }` with `decision` `"improved"`, `"regressed"` or `"inconclusive"`.

## Going further
Report effect size alongside significance, beware testing many variants and keeping the best (multiple comparisons), and prefer more labelled data over cleverer statistics.
