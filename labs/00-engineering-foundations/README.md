# Lab 00 — Engineering foundations (guided walkthrough)

**Status:** tutorial added; Phase 0 verification is still in progress. Follow the steps on your Mac, record outputs, and do not mark gates complete merely because a command was run.

## Outcomes
You will explain the monorepo, install dependencies reproducibly, run the React and Fastify applications, test the API, understand the deterministic PR review and inspect its evidence.

## 1. Prepare your Mac
Install Git, Node.js 22 and pnpm 9.15.9. Use a Node version manager if you already have one. In Terminal run:

```sh
git --version
node --version
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm --version
```

**Expected:** Git is installed, Node reports major version 22 and pnpm reports 9.15.9. If not, correct versions before proceeding. Do not paste secrets into terminal transcripts.

## 2. Get the verification branch
```sh
git clone https://github.com/IcodeNet/senior-ai-engineer-labs.git
cd senior-ai-engineer-labs
git fetch origin
git switch phase0-verification
git status --short
```

**Expected:** clean working tree. If you already cloned it, run `git fetch origin` and switch branches instead of cloning again.

## 3. Explore the architecture
Inspect `apps/web` (React UI), `apps/api` (Fastify API), `packages/shared` (shared code), `agent-factory` (deterministic review), and `.github/workflows` (CI). Open the root `package.json` and `pnpm-workspace.yaml`.

**Explain:** why a shared workspace is preferable to duplicating types, and why the API must enforce access controls instead of relying on an LLM.

## 4. Install and validate
```sh
pnpm install --no-frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

**Expected:** all commands exit 0. The non-frozen install is **temporary**: it does not prove reproducibility. The Phase 0 acceptance gate requires a committed lockfile and a passing `pnpm install --frozen-lockfile` in CI. Do not claim that gate is complete yet.

## 5. Verify the API and UI
Run `pnpm dev` in one terminal. Read the dev-server output to identify the actual local URLs and ports rather than assuming defaults. Open the React URL in a browser and request the Fastify `/health` endpoint at its reported address.

**Expected:** React loads; health endpoint returns HTTP 200. Separately, inspect `apps/api/src/app.test.ts` to see how the health route is tested without deploying Azure resources. The existing CI web check verifies build output, not browser behaviour.

## 6. Inspect the agent factory
Read `agent-factory/src/policy.ts` and `agent-factory/src/review.ts`. The current rules warn when infrastructure definitions change or when `AGENTS.md` changes. They generate findings; they do not block a PR.

Create a temporary input outside the repo:

```sh
printf '%s\n' '["infra/example.bicep","AGENTS.md"]' > /tmp/lab00-changed-paths.json
pnpm --filter @labs/agent-factory review /tmp/lab00-changed-paths.json
cat agent-factory/agent-review.json
```

**Expected:** JSON with `schemaVersion: 1`, `mode: "deterministic-report-only"`, and findings for `cloud-cleanup-review` and `agent-policy-review`. Confirm the generated report is in `agent-factory/`, not the repository root.

## 7. Verify CI evidence
Inspect [PR #3](https://github.com/IcodeNet/senior-ai-engineer-labs/pull/3), the [Phase 0 evidence record](../docs/PHASE-0-VERIFICATION.md), and the Agent Factory Review workflow. Check that the corrected workflow uploads `agent-factory/agent-review.json` and treats a missing file as an error. A committed fix is not the same as a successful rerun. The synthetic negative case in [PR #4](https://github.com/IcodeNet/senior-ai-engineer-labs/pull/4) also needs its own evidence.

## 8. Your exercise
Without looking at the policy source, explain what would happen for three changed-path inputs: `["apps/web/src/App.tsx"]`, `["infra/main.tf"]`, and `["AGENTS.md"]`. Run each input and compare the output with your prediction. Explain why warnings should not automatically be described as security enforcement.

## Completion checklist
- [ ] Tool versions recorded
- [ ] Local install, typecheck, tests and build passed
- [ ] API health endpoint and React UI inspected
- [ ] Positive and negative agent-review examples executed
- [ ] Evidence links captured for CI and generated artifacts
- [ ] Frozen lockfile CI gate verified
- [ ] Security/fork behaviour and independent review evidenced

**Important:** this checklist records your progress; it is not a claim that repository-wide Phase 0 is complete. No Azure resources are required for this introductory lab.
