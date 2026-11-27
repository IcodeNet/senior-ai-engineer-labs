# ADR 0004 — Real-Azure lab with explicit setup and shutdown

- Status: accepted
- Date: 2026-11-27

## Context
Labs 01–02 teach retrieval and evaluation with deterministic fakes. A senior AI engineer also needs to work with the real services: index schemas, embeddings, query modes, semantic ranking, keyless authentication and cost control. Real resources cost money; AGENTS.md requires a cost estimate, explicit approval, scoped cleanup and post-cleanup verification.

## Decision
- Lab 03 (course steps 17–21) runs against Azure AI Search **Basic** (the lowest tier with semantic ranker) and Azure OpenAI (embedding + chat deployments).
- Infrastructure is one Bicep template (`course/azure/main.bicep`) deployed into a single course-only resource group, tagged `course`, `owner`, `createdAt` and `expiresAt`.
- Lifecycle commands (`npm run azure:plan|up|status|down|verify`) wrap the Azure CLI. `plan` checks model availability and retirement in the chosen region and reads live list prices from the Azure Retail Prices API. `up` requires typing `create`; `down` requires typing the resource-group name, refuses untagged groups, deletes the whole group and purges the soft-deleted Azure OpenAI account; `verify` confirms nothing tagged for the course remains.
- Keys are disabled on both services; the learner gets data-plane role assignments and calls use Microsoft Entra ID tokens from `az`.
- Semantic ranker uses its free plan, so exhausting the allowance fails requests instead of billing.
- Each step has offline contract tests (exact REST requests against a fake transport) and live tests that run only when `.azure/env.json` exists. Acceptance and CI set `ICODE_AZURE_LIVE=0` and never call Azure.

## Consequences
- CI proves request shapes, setup/shutdown decision logic and that the Bicep template compiles; it cannot prove a live deployment. The first live run on a real subscription is still to be verified.
- Basic search is billed hourly while it exists; the lessons and commands repeat that `azure:down` is what stops charges.
- Model names and versions in `azure/config.json` will age; `azure:plan` detects unavailable or soon-retiring models before anything is created.
