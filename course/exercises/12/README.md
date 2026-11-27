# 12 · LLM-as-judge with strict parsing

## Why it matters
Correctness and relevance usually need judgement, and human review does not scale to every commit. An **LLM judge** applies a written rubric to each answer. It is itself an unreliable component, so treat its output like any untrusted API response:

- **Strict structure.** Demand JSON with an integer score and a reason; reject anything else. Never default a parse failure to a passing score — that hides judge outages as quality.
- **Bounded retries.** Retry invalid output a fixed number of times, then report an error.
- **Position bias.** In pairwise comparisons judges often prefer whichever answer comes first. Ask twice with the order swapped and only accept a consistent verdict.
- **Separation.** The judged answer and sources are data inside the user message; the rubric lives in the system message.

The model is injected, so these tests use deterministic fakes and cost nothing.

## Interview question
> Your judge rates the new prompt 4.6/5 versus 4.1 for the old one. What would make you distrust that result, and how would you test the judge itself?

## Your task
Implement in `index.ts`:

- `buildJudgePrompt({ question, answer, sources })` → `{ system: JUDGE_RULES, user }`; `user` contains `Question:`, `Answer:` and one `[S<n>] <text>` line per source.
- `parseVerdict(raw)` — strip an optional surrounding ```` ```json ```` fence, parse JSON, and return `{ ok: true, score, reason }`, or `{ ok: false, error }` with `error` one of `"not-json"` (unparseable or not an object), `"invalid-score"` (not an integer 1–5) or `"missing-reason"` (not a non-empty string after trimming; the returned reason is trimmed).
- `judgeAnswer(input, llm, retries = 1)` — call the judge up to `1 + retries` times until a verdict parses; return it with `attempts`, or the last error with `attempts`.
- `comparePairwise(question, first, second, llm)` — ask twice (`first` as A, then `second` as A) using `buildPairwisePrompt`; replies are `A`, `B` or `TIE` (trimmed, case-insensitive). Return `"first"`, `"second"` or `"tie"` when both agree, `"inconsistent"` when they disagree, and `"invalid"` if either reply is not one of the three.

## Going further
Use a different model family as judge than as generator, keep rubrics versioned, and sample judged cases for human review. Step 13 measures how far to trust the judge.
