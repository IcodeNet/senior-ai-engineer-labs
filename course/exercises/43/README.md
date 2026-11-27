# 43 · Failure-mode and effects analysis for an AI pipeline

## Why it matters
Design reviews in regulated firms ask "what can go wrong, how bad is it, and how would you know?". **FMEA** answers that systematically. For each failure mode of each pipeline stage (indexing, retrieval, generation, tools, observability) rate:

- **Severity** (1–10): impact if it reaches a user or regulator;
- **Occurrence** (1–10): how likely it is;
- **Detection** (1–10): how likely it escapes your controls — 10 means you would never notice.

**RPN** = severity × occurrence × detection ranks the work. Two senior refinements:

- **Severity overrides RPN.** A PII leak rated 10 × 2 × 3 = 60 looks low-priority by RPN but must be addressed. Require action when RPN ≥ a threshold *or* severity ≥ a threshold.
- **Controls change occurrence and detection, not severity.** Monitoring, canary tests and gates improve detection; input separation and validation reduce occurrence. Reducing severity needs a redesign (don't log prompts at all). Mitigations that would *raise* a rating are a mistake.

**RPN is ordinal, so treat it as a ranking aid only.** Severity, occurrence and detection are ordinal scales: 6 is not "twice" 3, a product of ordinal ratings is not a risk measure, and very different combinations share an RPN (10 × 2 × 3 and 4 × 5 × 3 are both 60). A **total** RPN across failure modes is only a progress indicator for the worksheet — "673 → 421" says work was done, not that risk fell by 37%. Report residual risk **per failure mode**. This weakness is why the AIAG-VDA FMEA handbook (2019) replaced RPN with **Action Priority** (high/medium/low) tables that look up the S/O/D combination, with severity dominating.

AI-specific failure modes are often **silent**: drifted embeddings, stale documents and fabricated citations produce fluent answers, so detection ratings are high until you add evaluations.

## Interview question
> Walk me through how you would risk-assess a RAG assistant before launch to client-facing staff. Which failure modes worry you most, and how do you decide what must be fixed before go-live?

## Model answer outline
- Enumerate failure modes per stage with the team: injection via documents or user input, stale/revoked content, access-control leakage, fabricated citations, PII in logs, quota exhaustion, model or embedding version drift, cost runaway.
- Rate S/O/D with agreed scales; compute RPN; severity ≥ 9 always needs action regardless of RPN.
- Mitigation plan per item with owner: occurrence controls (backend ACL filters, instruction/data separation, approvals) and detection controls (eval gates, canaries, groundedness monitors, alerts).
- Re-score after mitigation and show residual risk per failure mode; accept it explicitly with sign-off. Do not present a summed RPN as a risk number — ratings are ordinal; mention Action Priority (AIAG-VDA) as the current industry alternative.
- Keep the FMEA living: re-run on model changes and incidents; feed incidents back as new failure modes and test cases.

## Your task
Implement in `index.ts`:

- `rpn(mode)` — product of the three ratings; throw `RangeError` unless each is an integer from 1 to 10.
- `prioritise(modes, { rpnThreshold = 100, severityThreshold = 9 })` → `{ id, rpn, severity, actionRequired, trigger }[]`, with `trigger` `"both"`, `"rpn"`, `"severity"` or `"none"` (`>=` comparisons). Sort by RPN descending, then severity descending, then id.
- `applyMitigations(modes, mitigations)` → `{ modes, before, after }`, applying mitigations in order to copies of the modes (do not mutate the input); `before`/`after` are total RPN, used only to show that the worksheet moved (not as a risk measure). Throw `Error("unknown failure mode <id>")` for an unknown `modeId` and `RangeError` if a mitigation would raise a rating or gives an invalid rating.

## Going further
Weight severity by affected users, add an owner and due date per action, and generate test cases (step 09) from every high-severity failure mode.
