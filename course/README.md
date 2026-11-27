# Senior AI Engineer Labs — Icode Workshop course

The interactive course for this repository, run with [Icode Workshop](https://github.com/IcodeNet/Icode-workshop). Each step pairs a short lesson and an interview question with a TypeScript exercise: a failing starter (`problem/`), Vitest tests, and a reference solution (`solution/`).

## Prerequisites

- Node.js 22.13 or later (with npm and Corepack)
- Git

No cloud account, API key or paid service is used. Estimated cost: **£0**.

## Setup and run

From this `course/` directory:

```sh
npm run setup     # clones the pinned engine into .icode/engine, installs it and the course dependencies
npm run doctor    # checks Node.js and npm
npm start         # opens the workshop at http://127.0.0.1:5173 (API on 4317)
```

Choose a lesson, read it, edit the **Playground**, then **Run tests**. Compare with the solution when you are stuck. Your work and progress are stored in `.workshop/` (git-ignored), so they survive restarts; **Reset** restores the starter and keeps a backup.

The engine is pinned by commit in `icode/engine.json`. To use a local engine checkout instead, set `ICODE_ENGINE_DIR=/path/to/Icode-workshop`.

## Contents

| Step | Lesson | You implement |
|---|---|---|
| 01 | Chunking with governance metadata | Overlapping word windows carrying approval metadata |
| 02 | Approved, current documents only | Eligibility, version supersession, re-indexing and revocation |
| 03 | Lexical retrieval with BM25 | IDF, term-frequency saturation and length normalisation |
| 04 | Vector retrieval with cosine similarity | Cosine similarity and exhaustive KNN over a toy embedding |
| 05 | Hybrid retrieval with Reciprocal Rank Fusion | RRF fusion of lexical and vector rankings |
| 06 | Grounded prompts, citations and abstention | Untrusted-context prompts, escaping, evidence gate, citation checks |
| 07 | Measuring retrieval | Precision@K, Recall@K, MRR, NDCG@K |
| 08 | RAG orchestration with defence in depth | Retrieve → re-check eligibility → gate → generate → validate citations |
| 09 | Labelled evaluation datasets | Dataset validation, leakage checks, deterministic dev/test splits |
| 10 | A retrieval evaluation harness | Per-query and mean metrics, worst cases, one retrieval pass for many K |
| 11 | Citation coverage and groundedness checks | Per-sentence citation, source, number and lexical-support checks |
| 12 | LLM-as-judge with strict parsing | Rubric prompts, strict verdict parsing, bounded retries, position-bias check |
| 13 | Calibrating the judge against humans | Exact and within-one agreement, Cohen's κ, false-pass rate |
| 14 | Is it really better? Paired bootstrap comparison | Seeded paired bootstrap confidence intervals and decisions |
| 15 | Regression gates in CI | Floors, ceilings, tolerances, missing metrics, baseline ratchet |
| 16 | Cost and latency accounting | Token cost, nearest-rank P50/P95, monthly projection, budget check |
| 17 | Provision Azure and create a real index | Governed index schema with vector and semantic configuration |
| 18 | Embed and index documents with Azure OpenAI | Batched embeddings, valid keys, `isLatest`, 207 partial-failure handling |
| 19 | Keyword, vector, hybrid and semantic search on Azure | Four query modes behind a backend approval filter |
| 20 | Grounded answers with Azure OpenAI | Chat completions, content-filter handling, step 08 pipeline on real services |
| 21 | Evaluate on Azure, then shut down | Mode comparison on the labelled set, then teardown and verification |
| 38 | Capacity and token-throughput estimation | Tokens per request, peak TPM/RPM, Little's-law concurrency, deployments by binding limit |
| 39 | Latency budgets and P95 composition | End-to-end P95 from traces with parallel stages, budget allocation, breach report |
| 40 | Cost models: RAG vs fine-tuning vs long context | Fixed and variable cost per architecture, ranking by volume, break-even volume |
| 41 | Choosing a retrieval strategy from requirements | Decision function with reranker, controls and reason codes |
| 42 | SLOs and error budgets for AI features | Availability, latency and quality SLOs, error budgets, multi-window burn-rate paging |
| 43 | Failure-mode and effects analysis for an AI pipeline | RPN scoring, severity override, residual risk after mitigations |
| 44 | Build vs buy and model selection scorecards | Hard constraints, weighted min-max scores, weight sensitivity |
| 45 | System-design review: find the missing controls | Residency, approval, audit, PII, injection, cost-cap and access-control checks, verdict |

Steps 01–08 are **Lab 01, Azure AI Search and RAG concepts (local)** and steps 09–16 are **Lab 02, evaluation engineering (local)**: models, judges and retrievers are deterministic fakes and cost nothing. Steps 17–21 are **Lab 03, real Azure**: the same ideas against real Azure AI Search and Azure OpenAI, with setup and shutdown commands. Steps 38–45 are **Lab 06, architecture and interview drills (local)**: each turns a senior design judgement (capacity, latency, cost, retrieval choice, SLOs, FMEA, model selection, design review) into a tested function, and each lesson adds a model answer outline to its interview question; they cost nothing. All teaching happens in this course.

## Lab 03 — real Azure (paid while running)

Lab 03 creates billable Azure resources. You decide when they exist; `azure:down` removes them all.

**Extra prerequisites:** an Azure subscription where you can create resource groups and role assignments, and the [Azure CLI](https://aka.ms/azure-cli) (`az login`).

```sh
npm run azure:plan     # checks your login, model availability and live list prices; creates nothing
npm run azure:up       # shows what will be created, then requires you to type "create"
npm run azure:status   # what is running and an estimate of the search cost so far
npm run azure:down     # deletes the course resource group after you type its name
npm run azure:verify   # confirms nothing from the course remains
```

| What `azure:up` creates | How it is charged |
|---|---|
| Azure AI Search, Basic tier, 1 search unit | Every hour it exists, whether or not you use it. `azure:plan` shows the current list price for your region. |
| Semantic ranker, free plan | Monthly free allowance; beyond it, requests fail rather than being billed. |
| Azure OpenAI (S0) with an embedding deployment (`text-embedding-3-small`) and a chat deployment (`gpt-5-mini`) | Per token only; the labs use a small number of tokens. |
| Role assignments for you | Free. API keys are disabled; every call uses your Microsoft Entra ID token. |

Everything goes into one resource group, tagged `course=senior-ai-engineer-labs`, `owner` and `expiresAt`. `azure:down` refuses to delete a group without that tag, deletes the whole group, purges the soft-deleted Azure OpenAI account and removes `.azure/`; `azure:verify` then checks the subscription for anything left with the course tag. Deleting the resource group is what stops the charges — stopping the workshop or your computer does not. Budget alerts in Azure notify you; they do not stop spending.

Region and models are set in `azure/config.json` (default `swedencentral`). `azure:plan` refuses models that your region does not offer or that retire within a week; change the config if it does. List prices come from the public Azure Retail Prices API and may differ from your agreement.

Each Lab 03 step has **offline tests** (exact REST requests against a fake transport, always run) and **live tests** that run only when `.azure/env.json` exists. Course acceptance and CI never call Azure (`ICODE_AZURE_LIVE=0`).

## Verification

```sh
npm run typecheck     # strict TypeScript over every starter and solution
npm run validate      # engine course validation
npm test              # through the engine: every starter fails, every solution passes, learner journey
npm run test:browser  # real UI in Chromium (needs: npx playwright install chromium)
npm run test:tools    # Azure setup/shutdown decision logic, offline
```

`npm test` writes `acceptance-results/icode.json`. CI (`course` job in `.github/workflows/ci.yml`) runs all of the above.

## Authoring a new step

Add `exercises/NN/` with `lab.json`, `README.md` (including an `## Interview question` section), and complete `problem/` and `solution/` projects, each with a `package.json` whose `test` script is `vitest`. Starters must fail with `Not implemented` errors, not setup errors. Add the step to `course.json`; step IDs are two digits and unique across the whole course (at most 100). See the engine's `docs/course-authoring.md`.

Tests are practice feedback that learners can read and edit; they are not tamper-resistant grading.
