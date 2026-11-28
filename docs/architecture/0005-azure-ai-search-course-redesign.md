# 0005 · Azure AI Search course structure: foundation modules, advanced modules, step template

- **Status:** accepted (owner, 2026-11-28)
- **Date:** 2026-11-28

## Context

The course teaches one subject, Azure AI Search for apps and agents, through one throughline project (Northbank Support, a governed FAQ knowledge base), with three backend tracks (TypeScript first, then .NET and FastAPI). Learners need the course to say up front what it builds and what it costs, and to introduce concepts in order.

## Decision

1. **Foundation first.** Modules 0–11 come first, in order. Modules 0–2 (TypeScript track) are authored; Modules 3–11 are planned.
2. **Lab 03** (steps 17–21: real Azure, actions, cost banner, teardown) sits in Module 3's step range. Module 3 builds on it.
3. **Advanced modules A1–A3** (agent engineering and MCP, production AI, architecture and interview drills) use steps 71–94, after the foundation's whole range.
4. **Fixed ID blocks per module** ([step map](../course-step-map.md)) so modules can be written in parallel without changing each other's IDs.
5. **Step template** for foundation lessons: Concept, Theory, Check questions (3–5 fenced `question` YAML blocks: `prompt`, optional `options`, `answer`, `explanation`, optional `source: handoff`), Hands-on, Recap and next; plus Further reading citing Microsoft Learn.
6. **Enforcement:** the review factory checks the template on steps in `module-NN-…` modules; course acceptance and browser acceptance accept "Check questions" or "Interview question".

## Alternatives considered

- **Contiguous step IDs** (01, 02, 03, …): fewer gaps, but every new module would shift later IDs and collide with parallel work and learners' saved progress.
- **Lab 03 in its own block:** not chosen; it would touch the live-Azure lessons and tests without adding content.
- **Interactive quizzes first:** check questions are authored in the engine's `question` block format; interactive rendering is planned with the engine's check-questions feature, and until the course pins it the blocks show as YAML.

## Consequences

- Learner progress is keyed by step ID, so fixed blocks keep saved progress valid as modules are added.
- Some advanced lessons reference topics planned for Modules 4–8; they name the planned module.
- Judge calibration, bootstrap confidence intervals and CI evaluation gates are planned in Module 7.
