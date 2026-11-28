# Senior AI Engineer Labs

A course for **senior AI engineers** on **Azure AI Search for apps and agents**, taught entirely through an interactive [Icode Workshop](https://github.com/IcodeNet/Icode-workshop) course. One project runs through it, **Northbank Support**, a governed FAQ knowledge base: you design the index, load it, make retrieval good and safe, measure it, then put it behind an API, a React FAQ app and an agent. Every foundation step teaches the concept and theory, checks understanding with explained questions, then proves it hands-on: a failing starter, tests and a reference solution.

The repository contains two things:

| Folder | What it is |
|---|---|
| [`course/`](course/README.md) | The Icode Workshop course — lessons, exercises, tests and solutions |
| [`agent-factory/`](agent-factory/README.md) | The review factory — automated, report-only review of every change |

## The course

Runs on your own machine (laptop or desktop). Modules 0–2 and the advanced modules cost nothing: no cloud account or API key.

**Prerequisites:** Node.js 22.13 or later, Git.

```sh
cd course
npm run setup   # installs the pinned Icode engine and the course dependencies
npm start       # opens the workshop at http://127.0.0.1:5173
```

Pick a lesson, edit the **Playground**, then **Run tests**. Your work and progress are saved locally; **Reset** restores the starter.

| Module | Steps | Status |
|---|---|---|
| 0 · Welcome: what you'll build, how Icode works, costs and shutdown before anything is created | 01–02 | authored |
| 1 · Search foundations: why retrieval, analyzers and the inverted index, BM25 | 05–07 | authored |
| 2 · Index design: field attributes, the Northbank schema, query syntax and OData filters | 10–12 | authored |
| Lab 03 · Real Azure (paid while running), Module 3's predecessor | 17–21 | existing |
| 3–11 · Provision and load, chunking and embeddings, retrieval modes, governance, evaluation, RAG API, React FAQ app, agent, operate | 17–66 | planned |
| Advanced A1 · Agent engineering and MCP (was Lab 04) | 71–78 | existing |
| Advanced A2 · Production AI (was Lab 05) | 79–86 | existing |
| Advanced A3 · Architecture and interview drills (was Lab 06) | 87–94 | existing |

**Tracks:** TypeScript now; .NET and FastAPI planned (shared lessons, per-track hands-on). The full module map is in [`course/README.md`](course/README.md#module-map) and the step-number plan in [`docs/course-step-map.md`](docs/course-step-map.md). The previous Labs 01–06 course is preserved at tag `v0-labs`.

The local modules use deterministic fakes, so they are repeatable and free. Lab 03 runs against **real Azure** and costs money while its resources exist:

```sh
npm run azure:plan   # live prices and model checks; creates nothing
npm run azure:up     # type "create" to provision one tagged resource group
npm run azure:down   # type the group name to delete everything; charges stop
npm run azure:verify # confirms nothing remains
```

The Basic search service is billed every hour until `azure:down`; Azure OpenAI is billed per token. See [`course/README.md`](course/README.md#lab-03--real-azure-paid-while-running).

Details, verification commands and the authoring guide: [`course/README.md`](course/README.md).

## The review factory

A deterministic reviewer that runs on every pull request and every push to `main`. It checks changed paths (agent-rule changes, engine pin changes, teaching code outside the course) and the whole course structure (every step registered, nothing stray in a step folder, identical tests in starter and solution, starters that fail on stubs, solutions without stubs, the Vitest runner, the step template with 3–5 valid check questions on foundation lessons, an interview question on the others). It publishes a findings table in the job summary and an `agent-review.json` artifact.

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

The course is being redesigned ([ADR 0005](docs/architecture/0005-azure-ai-search-course-redesign.md)). Modules 0–2 (TypeScript) are authored on the redesign branch; Modules 3–11 and the .NET and FastAPI tracks are planned. Lab 03 is verified offline in CI; its live run against Azure has not yet been verified on a real subscription. The advanced modules (former Labs 04–06) are local and deterministic, verified in CI. Progress and evidence: [`docs/PROGRESS.md`](docs/PROGRESS.md). Decisions: [`docs/architecture/`](docs/architecture/).

## Rules for contributors and agents

[`AGENTS.md`](AGENTS.md) holds the working rules, including evidence-first reporting and approval gates for cloud spend. Financial-services examples use synthetic data only.
