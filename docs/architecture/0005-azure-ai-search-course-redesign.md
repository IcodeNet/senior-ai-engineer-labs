# 0005 · Azure AI Search course redesign: foundation modules, advanced modules, step template

- **Status:** accepted (owner confirmed the plan on 2026-11-28); this ADR records the first restructuring PR.
- **Date:** 2026-11-28

## Context

Labs 01–06 (45 steps) jumped between topics, did not open by saying what the course is, and did not build concepts in order. The owner confirmed a redesign around one subject, Azure AI Search for apps and agents, with one throughline project (Northbank Support, a governed FAQ knowledge base), and three backend tracks (TypeScript first, then .NET and FastAPI).

## Decision

1. **Foundation first.** Modules 0–11 come first. This PR authors Modules 0–2 (TypeScript track) and removes Labs 01–02.
2. **Lab 03 stays in place** (steps 17–21, real Azure, actions, cost banner, teardown) as Module 3's predecessor until Module 3 absorbs it.
3. **Labs 04–06 become advanced modules A1–A3**, content unchanged, renumbered to steps 71–94.
4. **Fixed ID blocks per module** ([step map](../course-step-map.md)) so modules can be written in parallel without renumbering.
5. **Step template** for foundation lessons: Concept, Theory, Check questions (3–5 fenced `question` YAML blocks: `prompt`, optional `options`, `answer`, `explanation`, optional `source: handoff`), Hands-on, Recap and next; plus Further reading citing Microsoft Learn.
6. **Enforcement:** the review factory checks the template on steps in `module-NN-…` modules; course acceptance and browser acceptance accept "Check questions" or "Interview question".
7. The pre-redesign course stays at commit `2ff7c3d`. The owner will create the tag `v0-labs` there; the agent could not push tags.

## Alternatives considered

- **Contiguous renumbering** (01, 02, 03, …): fewer gaps, but every new module would shift later IDs and collide with parallel work and learners' saved progress.
- **Moving Lab 03 to Module 3's block now:** deferred; it would touch the live-Azure lessons and tests without adding content.
- **Interactive quizzes first:** the engine quiz block is a separate engine PR; questions are authored now in its format and render as YAML code blocks until it lands.

## Consequences

- Learner progress saved under old IDs 22–45 does not carry over to 71–94 (the engine filters unknown IDs).
- Some advanced lessons reference topics now planned for Modules 4–8 that are not yet written; they point at the module.
- Lab 02's judge calibration, bootstrap and CI-gate content has no home in the confirmed arc except Module 7; that needs an owner decision when Module 7 is planned.
- `AGENTS.md` now describes the step ranges in the new map (a factual update the coordinator approved; no approval rules changed).

## Follow-up

Engine: quiz block, then per-track step IDs before the .NET track. Course: Modules 3–11, then rework A1–A3 to the template.
