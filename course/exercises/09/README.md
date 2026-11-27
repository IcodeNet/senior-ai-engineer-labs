# 09 · Labelled evaluation datasets

## Why it matters
Every metric in this lab is only as trustworthy as the dataset behind it. A **golden set** pairs realistic queries with the chunks a reviewer judged relevant, graded so NDCG can reward the best evidence first. Common ways it silently breaks:

- labels point at chunk IDs that no longer exist after re-chunking — recall drops and nobody knows why;
- the same question appears in dev and test, so tuning on dev inflates the test score (**leakage**);
- splits are random on every run, so numbers move without any code change.

Treat the dataset like code: versioned, validated in CI, split deterministically.

## Interview question
> You re-chunked the corpus and Recall@5 fell from 0.82 to 0.55 overnight. Before touching the retriever, what do you check?

## Your task
Implement in `index.ts`:

- `validateDataset(cases, corpusIds)` — return a list of problems (empty means valid), checking each case in order and, within a case, in this order:
  - `duplicate id: <id>` — an ID already seen (report once per repeat, then skip that case's other checks);
  - `<id>: empty query` — blank after trimming;
  - `<id>: no relevant chunks`;
  - `<id>: grade for <chunk> must be an integer from 1 to 3`;
  - `<id>: unknown chunk <chunk>` — not in `corpusIds`;
  - `<id>: same query as <earlierId>` — identical after `normaliseQuery`.
- `normaliseQuery(query)` — lower-case, replace anything that is not a letter, digit or space with a space, collapse whitespace, trim.
- `assignSplit(id, testFraction)` — `"test"` when `fnv1a(id) % 10000 < testFraction × 10000`, else `"dev"`; throw `RangeError` unless `0 <= testFraction <= 1`. `fnv1a` is provided.
- `splitDataset(cases, testFraction)` — `{ dev, test }` preserving input order.

## Going further
Track dataset versions alongside index versions, record who labelled what, and sample production queries (with consent and redaction) to keep the set representative.
