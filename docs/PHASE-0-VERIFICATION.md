# Phase 0 verification record

Status: **In progress** (2026-11-26). This document records evidence, not assertions.

| Gate | Evidence | Verdict |
| --- | --- | --- |
| Origin changes | [PR #3](https://github.com/IcodeNet/senior-ai-engineer-labs/pull/3) | Verified: branch and commits exist; not merged |
| Baseline install/typecheck/test/build | [CI run 45841315430](https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/45841315430) | Verified for earlier main commit only |
| Fastify health test | `apps/api/src/app.test.ts`; added to PR CI | [CI run 45844253372](https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/45844253372) passed |
| React production build output | PR CI checks `apps/web/dist/index.html` | [CI run 45844253372](https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/45844253372) passed; not a browser smoke test |
| PR policy report | `.github/workflows/agent-review.yml` | [Review run 45844253806](https://github.com/IcodeNet/senior-ai-engineer-labs/actions/runs/45844253806) passed all steps; artifact listing returned zero items, so report content remains unverified |
| Deliberate noncompliant PR | [Synthetic infra PR #4](https://github.com/IcodeNet/senior-ai-engineer-labs/pull/4) created; review outcome pending | In progress |
| Security and fork isolation | Read-only permissions and checkout credential isolation visible in workflow; fork behaviour not exercised | Partially inspected, not verified end-to-end |
| Reproducible frozen install | No committed pnpm lockfile on main at time of review | Not met |
| Independent review | No independent reviewer evidence | Not met |
| Final merge and green CI | PR #3 open | Not met |

Do not mark Phase 0 complete until every gate in [issue #2](https://github.com/IcodeNet/senior-ai-engineer-labs/issues/2) has linked evidence. No Azure resources were provisioned by this change.

## Latest observed workflow checks
- CI run 45844253372 completed successfully for commit `937e89a`: install, typecheck, test, build and smoke-test step all passed.
- Agent Factory Review run 45844253806 completed successfully for the same commit: factory tests, changed-path collection, report command and upload step all passed. GitHub artifact listing returned `total_count: 0`, so **do not claim the JSON report was retrieved or its findings verified**.
- Synthetic negative fixture PR #4 is deliberately left unmerged and must be closed after evidence is captured.
- Local runtime reproduction could not be performed in this execution environment: pnpm was unavailable and GitHub network DNS resolution failed. CI provides the verified execution evidence instead.

## Evidence review — report artifact defect (2026-11-26)
The logs of workflow run 45844253806 show the reviewer printed `{ "schemaVersion": 1, "mode": "deterministic-report-only", "findings": [] }` for PR #3, but `actions/upload-artifact` warned that `agent-review.json` did not exist at the repository root. The reviewer writes its file under `agent-factory/` because pnpm runs the package script from its package directory. Commit `bb7b73d7` corrects the upload path to `agent-factory/agent-review.json` and sets `if-no-files-found: error`. **The fix is committed, not yet validated by a new workflow run.** PR #3's empty findings are expected for its changed paths, but the synthetic PR #4 still requires negative-case verification. Do not close the gate based solely on successful workflow status.
