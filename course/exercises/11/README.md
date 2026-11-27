# 11 · Citation coverage and groundedness checks

## Why it matters
Retrieval metrics say whether the right evidence was found; they say nothing about whether the **answer** used it. Groundedness asks: is every claim supported by the sources it cites?

The gold standard is human review or an LLM judge (step 12), both slow and costly. Cheap deterministic checks catch many failures first and run on every answer in CI:

1. **Coverage** — does each sentence cite something?
2. **Valid sources** — does each citation refer to a source that was actually supplied?
3. **Numbers** — every number in a sentence must appear in a cited source. Fabricated limits and amounts are among the most damaging hallucinations in financial services.
4. **Lexical support** — enough of the sentence's content words appear in its cited sources.

Lexical overlap is a **proxy**: it misses paraphrases and cannot see that "not required" contradicts "required". Use it to flag answers for review, not to certify them.

## Interview question
> Your RAG answers cite sources 98% of the time, yet a reviewer finds wrong amounts. Why doesn't citation rate measure correctness, and what checks would you add?

## Your task
Implement in `index.ts`:

- `splitSentences(text)` — split after `.`, `!` or `?` followed by whitespace; trim; drop empty pieces.
- `contentTerms(text)` — remove `[S<n>]` markers, lower-case, split on anything that is not a letter or digit; keep terms with 3+ characters **or** any digit, excluding the exported `STOPWORDS`.
- `assessGroundedness(answer, sources, minOverlap = 0.5)` — for each sentence, its `citations` (labels in order, distinct) and the first failing check:
  - `"uncited"` — no citation;
  - `"unknown-source"` — a cited label is not in `sources`;
  - `"unsupported-number"` — a term containing a digit is missing from the cited sources' terms;
  - `"low-overlap"` — fewer than `minOverlap` of its content terms appear in the cited sources (a sentence with no content terms passes);
  - otherwise supported (`reason` omitted).
  Return `{ sentences, citationCoverage, supportedRate }`; both rates are 0 when there are no sentences.

## Going further
Natural-language-inference models and LLM judges check entailment; Azure AI Foundry evaluators include groundedness. Calibrate any automatic check against human labels (step 13).
