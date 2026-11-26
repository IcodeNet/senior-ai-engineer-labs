# Project Progress

Last updated: 2026-11-26

## Mission
Build an objective-driven, production-minded AI engineering learning platform and portfolio. Each lab connects theory, interview drills, runnable implementations, tests, evaluation and operational considerations.

## Confirmed decisions
- pnpm monorepo with shared React/TypeScript UI and Fastify API.
- Lab-specific orchestration stays inside each lab.
- Begin with Azure AI Search and RAG.
- Local-first development; Azure playground integration only when needed.
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
- [ ] Implement monorepo foundation; the directory layout currently documented is **proposed**, not yet implemented.
- [ ] Design the runnable Lab 01 local-first vertical slice.

## Next actions
1. Create pnpm workspace, shared TypeScript config, linting, Vitest and CI.
2. Create runnable React web and Fastify API with health endpoint and shared types.
3. Build Lab 01 local fixtures, retrieval interface, approval filtering and deterministic evaluation tests.
4. Add Azure integration behind explicit configuration, with cost review and safe provisioning/cleanup scripts.
5. Measure retrieval and generation quality; record reproducible results.

## Open decisions
- Exact Node.js and pnpm versions.
- Choice of local retrieval fixture or search emulator approach.
- Azure subscription, region, resource SKUs, free-tier availability and cost budget (must be verified before cloud deployment).
- Whether to use Azure CLI/Entra ID or API-key authentication for each service.

## Verification and constraints
Documentation commits are complete. **No runnable app, lab code, infrastructure, cost estimate or cleanup automation has yet been verified.** Do not mark those tasks complete until implemented and tested.

## Update protocol
After substantive work, record the date, completed work with evidence, next tasks, blockers, decisions and any cloud resources left running. Never store secrets or personal subscription identifiers here.
