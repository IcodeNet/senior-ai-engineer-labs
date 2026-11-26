# Project Progress

Last updated: 2026-11-26

## Mission
Build an objective-driven, production-minded AI engineering learning platform and portfolio. Each lab connects theory, interview drills, runnable implementations, tests, evaluation and operational considerations.

## Confirmed decisions
- pnpm monorepo with shared React/TypeScript UI and Fastify API.
- Lab-specific orchestration stays inside each lab.
- Begin with Azure AI Search and RAG.
- Local-first development; Azure playground integration only when needed.
- Lab 01 will use a provider abstraction with deterministic fixtures and evaluate an optional community Azure AI Search simulator; `azd`/Bicep are for real Azure deployment, not local emulation.
- Document Azure costs before provisioning and require explicit approval for chargeable resources.
- Use environment variables or appropriate identity credentials; never commit secrets.
- Every cloud lab must provide scoped cleanup and post-cleanup verification.
- Use synthetic or publicly approved financial-services examples.

## Completed
- [x] Root README describing project mission, learning tracks and proposed structure.
- [x] Lab 01 README specifying Azure AI Search/RAG topics, learning phases and cost/cleanup requirements.
- [x] Root AGENTS.md with durable engineering and agent instructions.
- [x] Project progress tracker established.
- [x] Architecture decision record convention established.

## In progress
- [ ] Complete Phase 0 monorepo and factory MVP verification. Foundation files exist on origin and CI passed install, typecheck, test and build, but runtime smoke tests and PR-review behaviour remain unverified.
- [ ] Design the runnable Lab 01 local-first vertical slice.

## Next actions
1. Close Phase 0 evidence checklist: https://github.com/IcodeNet/senior-ai-engineer-labs/issues/2. Verify runtime startup, real PR review, negative fixtures, security and independent review.
2. Confirm origin files and lockfile, pin toolchain, and update factory verification checks.
3. After Phase 0, build Lab 01 local fixtures, provider interface, approval/revocation filtering and deterministic evaluation tests; evaluate community simulator compatibility.
4. Add Azure integration behind explicit configuration, with cost review and safe provisioning/cleanup scripts.
5. Measure retrieval and generation quality; record reproducible results.

## Open decisions
- Exact Node.js and pnpm versions.
- Which pinned community simulator version, if any, passes compatibility and maintenance checks; deterministic fixtures remain the CI baseline.
- Azure subscription, region, resource SKUs, free-tier availability and cost budget (must be verified before cloud deployment).
- Whether to use Azure CLI/Entra ID or API-key authentication for each service.

## Planning change (2026-11-26)
The Lab 01 README now specifies local provider architecture, an optional simulator evaluation, provider parity tests and `azd`/Bicep cloud deployment controls. **Documentation committed; no simulator integration or Lab 01 runtime implementation is claimed.**

## Verification and constraints
Foundation files are present on origin. CI run https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/45841315430 succeeded on commit `237bd5f` and explicitly ran install, typecheck, test and build. This does **not** establish application startup, PR-review behaviour, local reproducibility or Phase 0 completion. Evidence-first rules added to AGENTS.md; factory verification is documented but not yet automated. No Azure resources were provisioned in this verification activity.

## Update protocol
After substantive work, record the date, completed work with evidence, next tasks, blockers, decisions and any cloud resources left running. Never store secrets or personal subscription identifiers here.
