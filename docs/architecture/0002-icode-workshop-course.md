# ADR 0002 — Deliver labs as an Icode Workshop course

- Status: accepted
- Date: 2026-11-27

## Context
Labs need lessons, interview questions, editable exercises and real tests in one place. Icode Workshop (IcodeNet/Icode-workshop) provides that workbench: per-step persistent playgrounds, reset/restore, comparison, streamed test output and course-scoped progress. Its compatibility with a real third-party course was proven by hosting MCP Fundamentals (IcodeNet/mcp-fundamentals, branch `feat/icode-workshop-host`, CI run 46013278215); the engine changes from that work were merged in IcodeNet/Icode-workshop PR #4 at `64f1fec`. The earlier home-grown player on `prototype/icode-workshop` is superseded.

## Decision
- The course lives in `course/` in Icode's **native** format (`course.json`, `exercises/NN/{lab.json,README.md,problem,solution}`), not the Epic compatibility layout.
- The engine is pinned by Git commit in `course/icode/engine.json`; no npm package is published yet.
- `course/` is a standalone npm project with its own `package-lock.json`, because the engine's `setup` installs course dependencies with `npm ci`. It is not part of the pnpm workspace.
- Exercises are TypeScript (strict) tested with Vitest through each variant's `test` package script (`testScript` in `lab.json`).
- Step IDs are globally unique two-digit IDs; Lab 01 uses 01–08. Later labs continue the sequence and add a module to `course.json`.

## Consequences
- Every step is verified through the engine itself in CI: starters fail on unimplemented code, solutions pass, and the learner journey (edit, reset, restore, progress, persistence) works; a Chromium check exercises the real UI.
- The engine pin must be bumped deliberately; a new pin requires the course job to pass.
- The two-digit ID limit caps the course at 100 steps; splitting into several courses is the escape hatch.
- Learners can read and edit tests, so results are practice feedback, not assessment.
