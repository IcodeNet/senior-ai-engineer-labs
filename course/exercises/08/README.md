# 08 · RAG orchestration with defence in depth

## Why it matters
This step wires the earlier pieces into the pipeline an API endpoint would run:

1. **Retrieve** candidates from a `SearchProvider` (in production, Azure AI Search with an approval filter).
2. **Re-check eligibility in your own code.** A misconfigured index, a stale filter or a provider bug must not leak a draft. Drop ineligible candidates and record their IDs for audit.
3. **Gate on evidence** — no eligible, relevant chunks means abstain without calling the model (no cost, no hallucination).
4. **Generate** with the grounded prompt.
5. **Validate the output** — reject answers that cite unknown sources or cite nothing.

`support.ts` contains working versions of `isEligible`, `buildGroundedPrompt` and `checkCitations` from steps 02 and 06. The provider and model are injected interfaces, so the tests use deterministic fakes and cost nothing.

## Interview question
> Your RAG endpoint's P95 latency is 6 s and finance asks why the monthly model bill doubled. Where do you look, and what would you change first?

Think about: abstaining early, `top`/`maxSources`, prompt size, caching, model choice, and logging tokens and latency per stage.

## Your task
Implement `answerQuestion(question, options)` in `index.ts`:

- call `provider.search(question, { top, now })` once (`top` defaults to 5, `minScore` to 0);
- drop candidates for which `isEligible(candidate, now)` is false; return their IDs as `dropped` in **every** result;
- build the prompt with `{ minScore, maxSources: top }`; on abstain return `{ kind: "abstain", reason: "no-evidence", dropped }` **without** calling the model;
- call `llm({ system, user })` once;
- if the answer cites any unknown label → abstain with reason `"unknown-citation"`; if it cites nothing → `"ungrounded"`;
- otherwise return `{ kind: "answer", text, citations, dropped }`, where `citations` are the cited `Source`s in order of first citation.

## Going further
Add per-stage timings and token counts, stream the answer, and expose the pipeline behind an HTTP endpoint with the provider selected by configuration.
