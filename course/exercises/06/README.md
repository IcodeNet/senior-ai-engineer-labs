# 06 · Grounded prompts, citations and abstention

## Why it matters
Retrieved text is **untrusted input**. A policy document, a web page or an email can contain "ignore your previous instructions…". Two engineering controls reduce the risk; neither removes it:

1. **Separate channels.** Your rules live in the system message. Retrieved chunks go in the user message, wrapped in delimited blocks, and are described as data to quote, not instructions to follow. Escape the delimiter so a chunk cannot close its own block and smuggle text outside it.
2. **Evidence gates.** If nothing relevant was retrieved (scores below a threshold), do not call the model at all — abstain. An answer the model has to invent is worse than "I don't know".

Then **verify citations** in the output: every `[S#]` must refer to a source you actually supplied, and an answer that cites nothing is not grounded.

## Interview question
> How would you defend a RAG assistant against indirect prompt injection planted in an indexed document? What can't you prevent with prompting alone?

Think about: access control and approval before retrieval (step 02), least-privilege tools, output validation, human review for high-impact actions, and red-team test cases.

## Your task
Implement in `index.ts`:

- `buildGroundedPrompt(question, chunks, { minScore = 0, maxSources = 5 })`
  - keep chunks with `score >= minScore`, at most `maxSources`, in the given order;
  - none left → `{ kind: "abstain", reason: "no-evidence" }`;
  - otherwise return `{ kind: "prompt", system, user, sources }`, where `sources[i]` is `{ label: "S<i+1>", chunkId, title }`;
  - `system` is the exported `SYSTEM_RULES` and must not contain retrieved text;
  - `user` contains the question and one `<source id="S1" title="…">…</source>` block per source, with `&`, `<`, `>` and `"` escaped in both the title and the text.
- `checkCitations(answer, sources)` — find every `[S<n>]` in the answer and return `{ cited, unknown }`: distinct labels in order of first appearance, split by whether a source with that label exists.

## Going further
Azure AI Content Safety *Prompt Shields* detects some injection attempts; treat it as an extra signal, not a guarantee. Log the source IDs behind every answer for audit.
