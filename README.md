# Senior AI Engineer Labs

Hands-on labs for **senior AI engineers**, taught entirely through an interactive [Icode Workshop](https://github.com/IcodeNet/Icode-workshop) course. Every step pairs a short lesson and an interview question with a TypeScript exercise: a failing starter, tests, and a reference solution.

The repository contains two things:

| Folder | What it is |
|---|---|
| [`course/`](course/README.md) | The Icode Workshop course — lessons, exercises, tests and solutions |
| [`agent-factory/`](agent-factory/README.md) | The review factory — automated, report-only review of every change |

## The course

Runs on your own machine (laptop or desktop). Labs 01, 02, 04, 05 and 06 cost nothing: no cloud account or API key.

**Prerequisites:** Node.js 22.13 or later, Git.

```sh
cd course
npm run setup   # installs the pinned Icode engine and the course dependencies
npm start       # opens the workshop at http://127.0.0.1:5173
```

Pick a lesson, edit the **Playground**, then **Run tests**. Your work and progress are saved locally; **Reset** restores the starter.

| Lab | Steps | Topics |
|---|---|---|
| 01 · Azure AI Search and RAG | 01–08 | Chunking with metadata, approval and revocation, BM25, vector search, hybrid search with RRF, grounded prompts and citations, retrieval metrics, RAG orchestration |
| 02 · Evaluation engineering | 09–16 | Labelled datasets, evaluation harness, groundedness checks, LLM-as-judge, judge calibration, paired bootstrap, CI regression gates, cost and latency |
| 03 · Real Azure (paid while running) | 17–21 | Real Azure AI Search index, Azure OpenAI embeddings, keyword/vector/hybrid/semantic search with approval filters, grounded answers, evaluation, then shutdown |
| 04 · Agent engineering and MCP | 22–29 | Tool schemas and validation, the tool-calling loop with limits, retries and idempotency, plan-and-execute state machine, human approval gates, an MCP server and a hand-written MCP client, agent evaluation and prompt injection via tool outputs |
| 05 · Production AI | 30–37 | Tenant isolation and document ACLs, PII redaction, prompt-injection defences and red-teaming, timeouts/retries/circuit breaker/fallback, per-user rate limits and token budgets, safe semantic caching, traces and safe logs, canary/shadow release with rollback |
| 06 · Architecture and interview drills | 38–45 | Capacity and token throughput, latency budgets and P95 composition, RAG vs fine-tune vs long-context cost, retrieval strategy decisions, SLOs and error budgets, FMEA, model selection scorecards with sensitivity, design review for missing controls |

Labs 01, 02, 04, 05 and 06 simulate models, judges, search and tools with deterministic fakes (Lab 04 uses the official MCP TypeScript SDK in memory), so they are repeatable and free. Lab 03 runs against **real Azure** and costs money while its resources exist:

```sh
npm run azure:plan   # live prices and model checks; creates nothing
npm run azure:up     # type "create" to provision one tagged resource group
npm run azure:down   # type the group name to delete everything; charges stop
npm run azure:verify # confirms nothing remains
```

The Basic search service is billed every hour until `azure:down`; Azure OpenAI is billed per token. See [`course/README.md`](course/README.md#lab-03--real-azure-paid-while-running).

Details, verification commands and the authoring guide: [`course/README.md`](course/README.md).

## The review factory

A deterministic reviewer that runs on every pull request and every push to `main`. It checks changed paths (agent-rule changes, engine pin changes, teaching code outside the course) and the whole course structure (every step registered, identical tests in starter and solution, starters that fail on stubs, solutions without stubs, the Vitest runner, an interview question per lesson). It publishes a findings table in the job summary and an `agent-review.json` artifact.

It is **report-only** and **not** an independent or AI reviewer: findings never fail a build until their precision has been measured. Rules and roadmap: [`agent-factory/README.md`](agent-factory/README.md).

```sh
pnpm install
pnpm --filter @labs/agent-factory test
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

- **verify** — installs the workspace and typechecks, tests and builds the review factory;
- **course** — sets up the pinned engine, typechecks every exercise, unit-tests the Azure setup/shutdown logic, compiles the Azure Bicep template (nothing is deployed), validates the course, runs every starter (must fail) and solution (must pass) through the engine, checks the learner journey, and drives the real workshop UI in Chromium.

`.github/workflows/agent-review.yml` runs the review factory.

## Status

Labs 01 and 02 are verified in CI. Lab 03 is verified offline in CI (exact Azure requests, setup/shutdown logic, Bicep compilation); its live run against Azure has not yet been verified on a real subscription. Labs 05 (production AI, steps 30–37) and 06 (architecture drills, steps 38–45) are local and deterministic; see the progress log for their CI evidence. Lab 04 (agents and MCP, steps 22–29) is verified in CI on its pull request branch; see its progress entry. Not yet built: real model judging in Lab 02 and live-model agent runs. Progress and evidence: [`docs/PROGRESS.md`](docs/PROGRESS.md). Decisions: [`docs/architecture/`](docs/architecture/).

## Rules for contributors and agents

[`AGENTS.md`](AGENTS.md) holds the working rules, including evidence-first reporting and approval gates for cloud spend. Financial-services examples use synthetic data only.
