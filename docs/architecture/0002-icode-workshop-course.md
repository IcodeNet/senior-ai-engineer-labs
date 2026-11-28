# ADR 0002 — Deliver labs as an Icode Workshop course

- Status: accepted
- Date: 2026-11-27

## Context
Labs need lessons, interview questions, editable exercises and real tests in one place. Icode Workshop (IcodeNet/Icode-workshop) provides that workbench: per-step persistent playgrounds, reset/restore, comparison, streamed test output and course-scoped progress. It also hosts courses in its apps layout (exercised by IcodeNet/mcp-fundamentals, branch `feat/icode-workshop-host`).

## Decision
- The course lives in `course/` in Icode's **native** format (`course.json`, `exercises/NN/{lab.json,README.md,problem,solution}`), not the apps layout.
- The engine is pinned by Git commit in `course/icode/engine.json`; no npm package is published yet.
- `course/` is a standalone npm project with its own `package-lock.json`, because the engine's `setup` installs course dependencies with `npm ci`. It is not part of the pnpm workspace.
- Exercises are TypeScript (strict) tested with Vitest through each variant's `test` package script (`testScript` in `lab.json`).
- Step IDs are globally unique two-digit IDs, assigned in fixed blocks per module ([step map](../course-step-map.md)); each module is registered in `course.json`.

## Consequences
- Every step is verified through the engine itself in CI: starters fail on unimplemented code, solutions pass, and the learner journey (edit, reset, restore, progress, persistence) works; a Chromium check exercises the real UI.
- The engine pin must be bumped deliberately; a new pin requires the course job to pass.
- The two-digit ID limit caps the course at 100 steps; splitting into several courses is the escape hatch.
- Learners can read and edit tests, so results are practice feedback, not assessment.
