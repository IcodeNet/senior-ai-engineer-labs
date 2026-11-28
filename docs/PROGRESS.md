# Project status

Last updated: 2026-11-28. This file records current status only; history is in commit messages and pull requests.

## Mission
Build an objective-driven, production-minded AI engineering learning platform and portfolio, taught through the Icode Workshop course in `course/`. Each step connects theory, interview drills, runnable implementations, tests, evaluation and operational considerations.

## Confirmed decisions
- Teach only through the Icode Workshop course in `course/`: native format, engine pinned by commit in `course/icode/engine.json`, TypeScript + Vitest exercises ([ADR 0002](architecture/0002-icode-workshop-course.md)).
- The repository holds only the course and the review factory (`agent-factory/`) ([ADR 0003](architecture/0003-course-and-factory-only.md)).
- Course structure: foundation Modules 0–11, advanced modules A1–A3, fixed step-ID blocks and a step template ([ADR 0005](architecture/0005-azure-ai-search-course-redesign.md), [step map](course-step-map.md)).
- Local, zero-cost exercises with deterministic fakes; any cloud integration requires a cost estimate and explicit approval first, with scoped cleanup and post-cleanup verification ([ADR 0004](architecture/0004-real-azure-lab.md)).
- Use environment variables or identity credentials; never commit secrets. Use synthetic or publicly approved financial-services examples.
- Public content is written in the present tense (see `AGENTS.md`).

## Course status

| Steps | Content | Status | Evidence |
|---|---|---|---|
| 01–02 | Module 0 · Welcome: readiness check; costs, cost banner and verify-to-clear rules | authored, CI verified | CI on `main` at `ad0623d`: https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46138372236 |
| 05–07 | Module 1 · Search foundations: why retrieval, analyzers and the inverted index, BM25 | authored, CI verified | same run |
| 10–12 | Module 2 · Index design: field attributes, the Northbank schema, query syntax and OData filters | authored, CI verified | same run |
| 17–23 | Module 3 · Provision and load (live): Bicep and costs, index deployment plan, push API, keyless Blob `jsonArray` indexer, skillset, knowledge store (offline), governed queries, shutdown and verify | authored on `feat/redesign-m3-m4` (PR #25), verified offline locally; CI and independent review pending; **live run on a real subscription not verified** | PR #25 |
| 25–28 | Module 4 · Chunking and embeddings: chunkers compared, similarity metrics, vector fields and HNSW, integrated vectorization (live) | same as Module 3 | PR #25 |
| 71–78 | Advanced A1 · Agent engineering and MCP | authored, CI verified | same run |
| 79–86 | Advanced A2 · Production AI | authored, CI verified | same run |
| 87–94 | Advanced A3 · Architecture and interview drills | authored, CI verified | same run |
| 30–66 | Modules 5–11 (retrieval modes, governance, evaluation, RAG API, React FAQ app, agent, operate) | planned | – |

The CI `course` job sets up the pinned engine, typechecks every exercise, tests the Azure lifecycle logic offline, compiles the Bicep template (nothing deployed), validates the course, runs every starter (must fail) and solution (must pass) and the learner journey through the engine, and drives the workshop UI in Chromium. Agent Factory Review on the same commit: https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46138372288.

Engine pin: see `course/icode/engine.json`. Check questions are authored as fenced `question` blocks, which the pinned engine renders as attempt-first quizzes.

## Review factory
Deterministic, report-only rules run on every pull request and push to `main`: changed-path rules, course structure, the step template and check questions, step layout and present tense. See `agent-factory/README.md`. It is not independent review; `AGENTS.md`'s independent-review requirement is met only by a separate reviewer session.

## Not verified
- A live cycle on a real subscription (`azure:plan` → `azure:up` → the live tests of steps 17–21, 23, 27 and 28 → `azure:down` → `azure:verify`).
- Windows for the fake-`az` engine tests (they run on Linux and macOS), and the Azure actions' TTY confirmation prompt (manual use only).
- A learner's own machine (Windows/macOS) end to end.

## Cloud resources
None provisioned by agents.

## Next actions
1. Modules 5–11, TypeScript track first; then the .NET and FastAPI tracks.
2. Pin an engine commit with interactive check questions once it is on Icode-workshop `main`.
3. Run and record the first live Modules 3–4 cycle (owner, approval-gated).
4. Measure the review factory's precision on real changes before letting any rule block a build.

## Open decisions
- Release criteria for the course (which modules, which platforms verified).
- Which Azure subscription, region and budget the live steps use.

## Update protocol
After substantive work, update the tables above to the current state, with evidence (commit, CI run URL). Do not keep a change log here. Never store secrets or personal subscription identifiers.
