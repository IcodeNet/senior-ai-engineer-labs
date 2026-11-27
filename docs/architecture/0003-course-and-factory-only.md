# ADR 0003 — The repository holds only the course and the review factory

- Status: accepted
- Date: 2026-11-27
- Supersedes: ADR 0001

## Context
ADR 0001 planned a pnpm monorepo with a shared React interface (`apps/web`), a Fastify API (`apps/api`), shared packages and per-lab folders (`labs/`). ADR 0002 then moved all teaching into the Icode Workshop course. The planned apps never grew beyond placeholders, and the lab folders held only specifications that duplicated the course. Keeping them made the repository confusing about where learning happens.

## Decision
- Teach only through the Icode Workshop course in `course/`.
- Keep the review factory in `agent-factory/`, the only pnpm workspace package.
- Remove `apps/`, `packages/`, `labs/`, `.env.example` and `docs/SETUP.md`. They remain available in Git history before this change.
- Keep `AGENTS.md` (evidence and approval rules) and `docs/` (progress and decisions) at least until the course is ready for release.

## Consequences
- The README describes only the course and the review factory.
- Cloud integrations (Azure AI Search, model calls) are not implemented; if added, they must come with a cost estimate, explicit approval, cleanup and verification as `AGENTS.md` requires, and be taught through course steps.
- The factory's `teach-through-icode` rule flags exercise or test code added anywhere outside `course/` and `agent-factory/`.
