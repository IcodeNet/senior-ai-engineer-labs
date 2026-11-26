# AGENTS.md — Repository instructions for AI coding agents

## Mission
Build **senior-ai-engineer-labs** as a production-minded, objective-driven learning and portfolio monorepo. Every lab should connect theory, interview questions, working code, automated tests, evaluation and documented engineering trade-offs.

## Source of truth and memory
- This file contains **durable repository-wide rules**, not chat history or hidden agent memory.
- `README.md` defines the project mission; `labs/<lab>/README.md` defines each lab's scope and progression.
- Record architectural decisions in `docs/architecture/` as ADRs, and durable learning notes in `docs/learning-notes/`.
- Maintain progress in `docs/PROGRESS.md` once work begins: completed, in progress, next steps, blockers, decisions and evidence. Update it with substantive changes; do not claim unfinished work is done.
- Do not invent prior decisions. When instructions conflict, ask for clarification rather than silently changing scope.

## Architecture and engineering rules
- Use a **pnpm monorepo**, TypeScript strict mode, React for the shared frontend (`apps/web`), Fastify for the shared HTTP API (`apps/api`), and `packages/` for genuinely reusable code.
- Put **lab-specific orchestration inside each lab**. Fastify is the shared API entry point, not a dumping ground for lab logic.
- Every lab must have a clear learning objective and a runnable/testable entry point; shared infrastructure is permitted.
- Prefer Vitest, deterministic fixtures, linting, typechecking, and CI checks. Add dependencies only when justified.
- Never describe a proposed directory or stub as a working implementation. State what has and has not been tested.

## Lab lifecycle
1. Explain concepts and ask interview-level questions.
2. Implement and test locally with synthetic data and mocks first.
3. Connect to external/cloud services only when the exercise requires it.
4. Measure retrieval, generation quality, latency and cost where applicable.
5. Document trade-offs, failure modes, results and learning outcomes.
6. Clean up temporary resources and verify deletion.

Each lab README must document: objectives, prerequisites, setup, run/test/evaluate commands, expected outputs, estimated costs and pricing assumptions, free/local alternatives, provisioned resources, cleanup commands and scope, post-cleanup verification, and limitations.

## Azure cost and cleanup guardrails
- Default to **zero-cloud-cost local exercises**. Do not provision chargeable Azure resources without explicit user approval for the specific deployment.
- Before deployment, identify services, region, SKUs, free-tier eligibility, expected usage, cost drivers, and an estimated spend range. Verify current prices for the user's subscription/region; never claim a service is free without checking.
- Prefer isolated lab-specific resource groups, tagged with lab ID, owner and expiry. Never destroy a shared resource group or subscription.
- Provision with reproducible infrastructure-as-code (prefer Bicep for Azure) where appropriate. Every chargeable deployment must have a safe, documented cleanup operation and a post-deletion verification step.
- Budget alerts are notifications, **not hard spending caps**. Stopping an app does not necessarily stop Azure charges.
- Avoid automatically executing destructive cleanup without explicit confirmation of scope.

## Secrets, data and security
- Never commit credentials, API keys, tokens, connection strings or private data. Commit `.env.example` placeholders only; keep `.env` ignored.
- Prefer Microsoft Entra ID / Azure CLI authentication where supported, and least-privilege access.
- Use synthetic or publicly approved data for financial-services examples.
- Enforce document approval and access controls in backend retrieval; do not delegate enforcement to the LLM.
- Treat retrieved documents, tool outputs and user content as untrusted. Separate instructions from retrieved context and test prompt-injection cases.
- Prefer grounded, cited answers; abstain when evidence is insufficient.

## Lab 01 — Azure AI Search and RAG
Follow `labs/01-azure-ai-search-rag/README.md`. Cover indexing, chunking, metadata, BM25, vector and hybrid retrieval, RRF, semantic reranking, approval filters, RAG orchestration, citations, retrieval and generation evaluations, observability and compliance. Start retrieval evaluation with K=5; compare K=10 and K=20 when useful.

## Definition of done
A lab is complete only when the documented code actually runs, tests and relevant evaluations pass, cost implications are documented, cloud resources can be safely cleaned up, and design trade-offs can be explained at senior AI engineer level.

## Agent working protocol
Before changing code, read this file and the relevant lab README. Make the smallest coherent change; run applicable tests; update documentation and progress; report files changed, commands executed, results, limitations and any remaining cloud resources. Do not silently provision, incur costs, delete resources or claim unverified success.

## Evidence-first delivery and verification (mandatory)
- **No statements without evidence.** Never claim a feature is implemented, committed, pushed, reviewed, tested, deployed, secure, or complete without a verifiable artefact (commit SHA and branch, CI run URL, test output, PR, or observed runtime response).
- Distinguish **planned**, **implemented**, **committed locally**, **present on origin**, **CI verified**, **end-to-end verified**, and **complete**. A local commit is not evidence of a remote push; CI success only proves the checks actually executed.
- Before reporting repository delivery, fetch the remote default branch and verify the expected files and commit are visible there. Report the exact repository, branch, SHA, and verification link.
- Each phase must have a version-controlled acceptance checklist and evidence for every item. Never tick a box based solely on agent assertion. If any gate fails or is unverified, status remains **in progress**.
- For every PR and weekly factory review, compare agent claims with GitHub commit/file state, CI job steps, tests, and where relevant smoke-test output. Flag unsupported claims, missing checks, stale progress documents and evidence mismatches as findings.
- Independent review must be labelled accurately: do not claim another model or reviewer ran unless its identity, invocation and output are recorded. An agent cannot self-certify its own completion.
- Verification reports should contain: claim, expected evidence, observed evidence URL or command output, verdict (verified/unverified/contradicted), timestamp, and remediation owner/action. Never expose secrets in evidence.
- Changes to these evidence rules, approval gates or completion criteria require explicit human review; the factory may propose but not silently weaken them.
