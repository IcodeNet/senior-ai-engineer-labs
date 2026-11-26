# Agent Factory MVP

This first implementation is deterministic and report-only, **not an LLM reviewer**. Pull requests trigger a read-only policy review of changed paths, publishing `agent-review.json` as a workflow artifact. No write token, AI model secret, automatic code change, or Azure provisioning is involved.

Run `pnpm --filter @labs/agent-factory test`. To review a list of paths, save a JSON array of filenames and run `pnpm --filter @labs/agent-factory review /absolute/path/paths.json`.

Future waves: evidence schemas, model-based reviewers with independent evaluations, scheduled reports and human-approved improvement PRs.
