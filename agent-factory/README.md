# Agent Factory MVP

This implementation is deterministic and report-only, **not an LLM reviewer**. It runs on every pull request and every push to `main` (`.github/workflows/agent-review.yml`), publishes `agent-review.json` as a workflow artifact and a findings table in the job summary. No write token, AI model secret, automatic code change or Azure provisioning is involved. Findings never fail the build until their precision has been measured (roadmap Wave 1).

## Rules

Changed-path rules (`src/policy.ts`):

| Rule | Trigger |
|---|---|
| `cloud-cleanup-review` | Infrastructure files under `infra/` changed |
| `agent-policy-review` | `AGENTS.md` changed — human approval required |
| `engine-pin-review` | `course/icode/engine.json` changed — the course CI job must pass on that commit |
| `teach-through-icode` | Exercise or test code added under `labs/` — teaching belongs in the Icode course |

Course structure rules (`src/course.ts`), checked on the whole `course/` tree independently of the course's own acceptance script:

| Rule | Checks |
|---|---|
| `course-step-registration` | Every `exercises/NN` is listed in `course.json` exactly once, in ascending order, and every listed step exists |
| `course-variant-parity` | `problem/` and `solution/` contain the same files, and only the entry file differs (tests cannot be weakened in one variant) |
| `course-starter` | The starter fails on `Not implemented` stubs and is not identical to the solution |
| `course-solution` | The reference solution contains no stubs or TODOs |
| `course-test-runner` | `lab.json` uses `"testScript": "test"` with `["--run"]`, and each variant's `test` script is `vitest` |
| `course-lesson` | The lesson README has a title and an `## Interview question` section |

## Run locally

```sh
pnpm --filter @labs/agent-factory test
echo '["course/icode/engine.json"]' > /tmp/paths.json
pnpm --filter @labs/agent-factory review /tmp/paths.json "$PWD"
```

The second argument is the repository root to review (default: the parent of `agent-factory/`).

Future waves: evidence schemas, claim auditing against commits and CI runs (AF-19), model-based reviewers with recorded identity and calibrated precision, scheduled reports and human-approved improvement PRs. See `ROADMAP.md`.
