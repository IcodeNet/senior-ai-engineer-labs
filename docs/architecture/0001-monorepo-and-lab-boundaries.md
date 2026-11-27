# ADR 0001: Monorepo and lab boundaries

- **Status:** Superseded by [ADR 0003](0003-course-and-factory-only.md) (2026-11-27)
- **Date:** 2026-11-26

## Context
The repository will contain multiple objective-driven AI engineering labs. We need a consistent learning experience without tightly coupling lab-specific orchestration to one large backend.

## Decision
Use a pnpm monorepo with `apps/web` for a shared React/TypeScript interface, `apps/api` for Fastify HTTP entry points, `labs/` for independently runnable and testable lab logic, `packages/` for justified shared modules, `infra/` for deployment definitions and `docs/` for engineering documentation.

Start with Lab 01 (Azure AI Search and RAG). Other labs may have documented objectives but must not be presented as implemented until runnable.

## Alternatives considered
- Separate repository per lab: isolation but duplicated setup and fragmented portfolio.
- Single monolithic API: simple initially but makes lab-specific logic harder to isolate and test.

## Consequences
Shared tooling improves consistency. Boundaries and dependencies must remain explicit. Each lab needs its own objectives, tests, evaluations, setup, cost guidance and cleanup procedures.

## Follow-up
Implement the workspace, verify local run/test commands, and document any necessary changes in a new ADR.
