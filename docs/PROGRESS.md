# Project status

Last updated: 2026-11-28. This file records current status only; history is in commit messages and pull requests.

## Mission
Build an objective-driven, production-minded AI engineering learning platform and portfolio, taught through the Icode Workshop course in `course/`. Each step connects theory, interview drills, runnable implementations, tests, evaluation and operational considerations.

## Confirmed decisions
- Teach only through the Icode Workshop course in `course/`: native format, engine pinned by commit in `course/icode/engine.json`, TypeScript + Vitest exercises ([ADR 0002](architecture/0002-icode-workshop-course.md)).
- The repository holds only the course and the review factory (`agent-factory/`) ([ADR 0003](architecture/0003-course-and-factory-only.md)).
- Course structure: foundation Modules 0–11, Lab 03 in Module 3's step range, advanced modules A1–A3, fixed step-ID blocks and a step template ([ADR 0005](architecture/0005-azure-ai-search-course-redesign.md), [step map](course-step-map.md)).
- Local, zero-cost exercises with deterministic fakes; any cloud integration requires a cost estimate and explicit approval first, with scoped cleanup and post-cleanup verification ([ADR 0004](architecture/0004-real-azure-lab.md)).
- Use environment variables or identity credentials; never commit secrets. Use synthetic or publicly approved financial-services examples.
- Public content is written in the present tense (see `AGENTS.md`).

## Course status

| Steps | Content | Status | Evidence |
|---|---|---|---|
| 01–02 | Module 0 · Welcome: readiness check; costs, cost banner and verify-to-clear rules | authored, CI verified | CI on `main` at `ad0623d`: https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46138372236 |
| 05–07 | Module 1 · Search foundations: why retrieval, analyzers and the inverted index, BM25 | authored, CI verified | same run |
| 10–12 | Module 2 · Index design: field attributes, the Northbank schema, query syntax and OData filters | authored, CI verified | same run |
| 17–21 | Lab 03 · Real Azure AI Search and RAG: course actions, fail-closed cost status, verified teardown | authored, CI verified offline; **live run on a real subscription not verified** | same run (live tests disabled with `ICODE_AZURE_LIVE=0`) |
| 71–78 | Advanced A1 · Agent engineering and MCP | authored, CI verified | same run |
| 79–86 | Advanced A2 · Production AI | authored, CI verified | same run |
| 87–94 | Advanced A3 · Architecture and interview drills | authored, CI verified | same run |
| 17–66 | Modules 3–11 (rest of Module 3, chunking and embeddings, retrieval modes, governance, evaluation, RAG API, React FAQ app, agent, operate) | planned | – |

The CI `course` job sets up the pinned engine, typechecks every exercise, tests the Azure lifecycle logic offline, compiles the Bicep template (nothing deployed), validates the course, runs every starter (must fail) and solution (must pass) and the learner journey through the engine, and drives the workshop UI in Chromium. Agent Factory Review on the same commit: https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46138372288.

Engine pin: IcodeNet/Icode-workshop `c4099e4` (course actions, typed confirmations, indicators). Check questions are authored as fenced `question` blocks and show as YAML until the course pins an engine with interactive check questions.

## Review factory
Deterministic, report-only rules run on every pull request and push to `main`: changed-path rules, course structure, the step template and check questions, step layout and present tense. See `agent-factory/README.md`. It is not independent review; `AGENTS.md`'s independent-review requirement is met only by a separate reviewer session.

## Not verified
- A live Lab 03 cycle on a real subscription (`azure:plan` → `azure:up` → steps 17–21 live → `azure:down` → `azure:verify`).
- Windows for the fake-`az` engine tests (they run on Linux and macOS), and the Lab 03 TTY confirmation prompt (manual use only).
- A learner's own machine (Windows/macOS) end to end.

## Cloud resources
None provisioned by agents.

## Next actions
1. Module 3 (provision and load) and Modules 4–11, TypeScript track first; then the .NET and FastAPI tracks.
2. Pin an engine commit with interactive check questions once it is on Icode-workshop `main`.
3. Run and record the first live Lab 03 cycle (owner, approval-gated).
4. Measure the review factory's precision on real changes before letting any rule block a build.

## Open decisions
- Release criteria for the course (which modules, which platforms verified).
- Which Azure subscription, region and budget the live steps use.

## Update protocol
After substantive work, update the tables above to the current state, with evidence (commit, CI run URL). Do not keep a change log here. Never store secrets or personal subscription identifiers.
