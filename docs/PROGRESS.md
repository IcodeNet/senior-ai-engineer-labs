# Project Progress

Last updated: 2026-11-27

## Mission
Build an objective-driven, production-minded AI engineering learning platform and portfolio. Each lab connects theory, interview drills, runnable implementations, tests, evaluation and operational considerations.

## Confirmed decisions
- Teach only through the Icode Workshop course in `course/`: native format, engine pinned by commit, TypeScript + Vitest exercises ([ADR 0002](architecture/0002-icode-workshop-course.md)).
- The repository holds only the course and the review factory (`agent-factory/`) ([ADR 0003](architecture/0003-course-and-factory-only.md)). `AGENTS.md` and `docs/` stay until the course is ready for release.
- Local, zero-cost exercises with deterministic fakes; any cloud integration requires a cost estimate and explicit approval first, with scoped cleanup and post-cleanup verification.
- Use environment variables or identity credentials; never commit secrets.
- Use synthetic or publicly approved financial-services examples.

## Completed
- [x] Course Lab 01 — Azure AI Search and RAG concepts, steps 01–08 (CI evidence below).
- [x] Course Lab 02 — Evaluation engineering, steps 09–16 (CI evidence below).
- [x] Review factory runs on every pull request and push to `main`, with course structure rules (CI evidence below).
- [x] Repository reduced to the course and the review factory (entry dated 2026-11-27, restructure).
- [ ] Course Lab 03 — real Azure, steps 17–21: implemented and verified offline; live run on a real subscription not yet verified.
- [ ] Course Lab 06 — architecture and interview drills, steps 38–45: implemented on branch `lab-06-architecture-drills` (PR open, not merged; see entry dated 2026-11-27, Lab 06).

## In progress
- [ ] Course release readiness: real-environment check on a learner's machine (Windows/macOS), and a decision on whether cloud steps belong in the first release.

## Next actions
1. Decide the next lab (agent engineering, MCP or production AI) and add it as course steps 17+.
2. Measure the review factory's precision on real changes before letting any rule block a build.
3. Independent review: AGENTS.md requires review the author did not perform; the deterministic factory does not meet that requirement.
4. Optional, approval-gated: cloud steps (Azure AI Search, real model judging) with cost estimate, cleanup and verification.

## Open decisions
- Release criteria for the course (which labs, which platforms verified).
- Whether and when to add cloud-backed steps, and on which Azure subscription, region and budget.

## Planning change (2026-11-26)
The Lab 01 README now specifies local provider architecture, an optional simulator evaluation, provider parity tests and `azd`/Bicep cloud deployment controls. **Documentation committed; no simulator integration or Lab 01 runtime implementation is claimed.**

## Icode Workshop course (2026-11-27)
- Implemented: `course/` with eight Lab 01 steps (chunking, approval/revocation, BM25, vector search, RRF, grounded prompts/citations, retrieval metrics, RAG orchestration). Each has a lesson, interview question, failing starter, Vitest tests and solution.
- Engine: IcodeNet/Icode-workshop pinned at `64f1fec` (main after merging PR #4).
- Local evidence (this session, not CI): `npm run setup`, `doctor`, `typecheck`, `validate` and `npm test` passed — 8 starters failed on unimplemented code, 8 solutions passed, learner journey (edit, reset, restore, progress, persistence) passed through the engine, twice.
- CI verified on `main` at `bbbc679`: https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46028745534 — `course` job ran setup, doctor, typecheck, validate, engine acceptance (16 variants as expected; learner journey) and browser acceptance in Chromium (all 8 lessons open with title and interview question; starter fails from the UI; edit and save turns it green; ports 4317/5173 released). The first push (`bcd8869`, run 46028376447) failed browser acceptance because engine acceptance left the solution in the step 01 playground; fixed in `bbbc679`.
- Not covered: Fastify/React integration, Azure AI Search, real embeddings or models, measured results. Browser acceptance cannot run in the agent sandbox (no Chromium); CI is the gate.
- No Azure resources provisioned.

## Lab 02 evaluation engineering (2026-11-27)
- Decision: teach only through Icode Workshop; `labs/` holds specifications, infrastructure and results.
- Implemented: course steps 09–16 (datasets, retrieval harness, groundedness checks, LLM judge, judge calibration, paired bootstrap, regression gates, cost/latency) and `labs/02-evaluation-engineering/README.md`.
- Local evidence (this session, not CI): typecheck, validate (16 steps) and engine acceptance passed — 32 variants as expected and the learner journey.
- CI verified on `main` at `6ca91c0`: https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46048874925 — engine acceptance (16 steps, 32 variants, learner journey) and browser acceptance (all 16 lessons open; starter fails and edited playground passes in the UI; ports released).
- Not implemented: real-model judging and measured results. No Azure resources provisioned.

## Review factory on main (2026-11-27)
- Changed: `agent-review.yml` now runs on pushes to `main` as well as pull requests (work was being committed straight to `main` and was never reviewed). Fixed the artifact path, which pointed at the repo root while the report is written to `agent-factory/`.
- Added deterministic, report-only rules: engine pin changes, teaching code under `labs/`, and course structure (step registration, problem/solution parity, starter and solution stubs, Vitest runner, interview question).
- CI verified on `main` at `f7c511c`: Agent Factory Review run https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46049398955 triggered by the push, reviewed 9 changed paths with 0 findings and published the `agent-review-report` artifact; CI run https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46049399001 passed `verify` (including the 12 factory tests) and `course`.
- This is still a deterministic checker, not independent review; AGENTS.md's independent-review requirement is not met by it.

## Phase 0 foundation (2026-11-26, superseded by ADR 0003)
Foundation files are present on origin. CI run https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/45841315430 succeeded on commit `237bd5f` and explicitly ran install, typecheck, test and build. This does **not** establish application startup, PR-review behaviour, local reproducibility or Phase 0 completion. Evidence-first rules added to AGENTS.md; factory verification is documented but not yet automated. No Azure resources were provisioned in this verification activity.

## Restructure: course and factory only (2026-11-27)
- Removed `apps/`, `packages/`, `labs/`, `.env.example` and `docs/SETUP.md`; workspace reduced to `agent-factory`. README rewritten to describe only the course and the review factory. ADR 0003 supersedes ADR 0001. AGENTS.md references updated (evidence and approval rules unchanged), with the user's explicit instruction.
- CI verified on `main` at `b7c2691`: CI https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46060395738 (`verify`, `course`) and Agent Factory Review https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46060395760. Its `teach-through-icode` finding was a false positive from deleted files; fixed in `8a39f38`. Renovate configuration merged (PR #1); PRs #3 and #4 closed. Remote branches `phase0-verification`, `phase0-negative-policy-fixture`, `prototype/icode-workshop` and `renovate/configure` still exist: the agent session is not permitted to delete branches.

## Lab 03 real Azure (2026-11-27)
- Decision: ADR 0004. Azure AI Search Basic + Azure OpenAI, one tagged resource group, keyless RBAC, typed confirmations, verified teardown.
- Implemented: `course/azure/main.bicep`, `azure/config.json`, `icode/azure.mjs` (plan/up/status/down/verify), `icode/azure-lib.mjs` with tests, course steps 17–21 with offline and live tests.
- Local evidence (this session, not CI): Bicep CLI 0.49.2 build and lint clean (7 resources); `test:tools` 6 tests passed; typecheck; validate (21 steps); engine acceptance 42 variants as expected with live tests skipped.
- CI verified on `main` at `33dcf2e`: https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46062531684 — `course` job passed Azure lifecycle logic tests, Bicep compilation (no deployment), engine acceptance (21 steps, 42 variants, learner journey; live tests disabled) and browser acceptance (all 21 lessons). Agent Factory Review https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46062531680: 93 changed paths, 0 findings.
- Not verified: any live Azure run (no Azure CLI or subscription in the agent environment). The first `azure:plan` → `azure:up` → steps 17–21 live → `azure:down` → `azure:verify` cycle must be run and recorded here.
- No Azure resources provisioned by the agent.

## Lab 06 architecture and interview drills (2026-11-27)
- Implemented on branch `lab-06-architecture-drills` (PR #8 to `main`, not merged): course steps 38–45 as module `lab-06-architecture-drills` — capacity and token throughput (38), latency budgets and P95 composition (39), RAG vs fine-tune vs long-context cost models (40), retrieval strategy decision function with reason codes (41), availability/latency/quality SLOs with error budgets and burn-rate paging (42), FMEA scoring with severity override and residual risk (43), model-selection scorecard with hard constraints and weight sensitivity (44), design review for missing controls (45). Each lesson has an interview question and a model answer outline. Deterministic, synthetic data, placeholder prices and limits; no new dependencies; £0.
- Independent review (separate Claude Code session, workstream D, posted on PR #8): approve with fixes, 6 should-fix and 6 nits. Addressed in a follow-up commit: P95 composition is exact only under perfect correlation and can underestimate (new counterexample test); additive budgets described as a heuristic; reranker check adds search and rerank time; tests pin exact-identifier, multilingual and `<=` boundary rules (the reviewer's style-only and `<` mutants now fail); sensitivity tests cover a weight decrease (increase-only mutant now fails); retrieval always counts as untrusted input in the design review; retention maximum and normalised region comparison added; RPN caveated as ordinal with Action Priority (AIAG-VDA) mentioned; 14.4 burn-rate threshold explained; min-max rank reversal noted; token/request tie-break tested.
- Local evidence after the fixes (this session, not CI): `npm run typecheck` clean; `npm run validate` → 29 steps; `npm test` → "Acceptance passed: 29 steps, 58 variants, learner journey through engine 64f1fec", every new starter failing all its tests (6, 6, 5, 10, 6, 5, 5, 7 = 50 tests) and every solution passing.
- CI verified on PR #8 at `990ab76` (last code commit; the following commit changes only this file): CI https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46075036357 (pull_request) and https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46075028342 (push) passed `verify` and `course` — engine acceptance "29 steps, 58 variants, learner journey", browser acceptance "All 29 lessons open with their title and interview question"; Agent Factory Review https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/46075035843 reviewed 68 changed paths (the full PR diff) with 0 findings. Not merged, so not yet on `main`.
- Not verified locally: browser acceptance (no Chromium in the agent sandbox); CI is the gate. Steps 22–37 are reserved for other labs being authored in parallel; the course has a numbering gap until they land.
- No Azure resources provisioned.

## Update protocol
After substantive work, record the date, completed work with evidence, next tasks, blockers, decisions and any cloud resources left running. Never store secrets or personal subscription identifiers here.
