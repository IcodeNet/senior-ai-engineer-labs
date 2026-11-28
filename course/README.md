# Senior AI Engineer Labs — Azure AI Search for apps and agents

The interactive course for this repository, run with [Icode Workshop](https://github.com/IcodeNet/Icode-workshop). It teaches one subject properly: **Azure AI Search** (documented by Microsoft as *Foundry IQ (Azure AI Search)*), and how an app, a React FAQ app and an agent use it. One project runs through it: **Northbank Support**, a governed FAQ knowledge base where only approved, in-date content may ever reach a model.

Every foundation step follows the same template: **Concept**, **Theory**, 3–5 **Check questions** with explained answers, **Hands-on** (a failing starter in `problem/`, Vitest tests and a reference solution in `solution/`) and **Recap and next**. Azure claims are checked against Microsoft Learn and cited in each lesson's Further reading.

## Prerequisites

- Node.js 22.13 or later (with npm and Corepack)
- Git

Modules 0–2 and the advanced modules use no cloud account, API key or paid service. Estimated cost: **£0**. Modules 3 and 4 have live Azure tests (steps 17–23, 27 and 28), paid while the resources exist; their offline tests are free. See below and step 02.

## Setup and run

From this `course/` directory:

```sh
npm run setup     # clones the pinned engine into .icode/engine, installs it and the course dependencies
npm run doctor    # checks Node.js and npm
npm start         # opens the workshop at http://127.0.0.1:5173 (API on 4317)
```

Choose a lesson, read it, edit the **Playground**, then **Run tests**. Compare with the solution when you are stuck. Your work and progress are stored in `.workshop/` (git-ignored), so they survive restarts; **Reset** restores the starter and keeps a backup.

The engine is pinned by commit in `icode/engine.json`. To use a local engine checkout instead, set `ICODE_ENGINE_DIR=/path/to/Icode-workshop`.

## Tracks

Concepts, theory and check questions are shared; hands-on code is per track. **TypeScript** (Vitest) is available now. **.NET** and **FastAPI** tracks are planned; they need per-track step IDs in the engine first.

## Module map

Step IDs are reserved in blocks per module, so there are gaps; see [`docs/course-step-map.md`](../docs/course-step-map.md). Until the engine renders quizzes, check questions show as `question` YAML blocks.

| Steps | Module | Status | You build |
|---|---|---|---|
| 01–02 | **0 · Welcome** | authored | Course readiness check; cost estimate, cost-banner and verify-to-clear rules |
| 05–07 | **1 · Search foundations** | authored | Governed naive retrieval under a token budget; tokenizer, analyzer and inverted index; BM25 checked against a hand-worked example |
| 10–12 | **2 · Index design** | authored | Index-definition validator (attributes, types, vectors, names); the Northbank schema, document keys and governance review; query-parser choice and OData governance filters with schema checking |
| 17–23 | **3 · Provision and load (live)** | authored | Bicep review and service limits; index deployment with an update-or-rebuild plan; push batching with 207 handling and retries; keyless Blob data source and `jsonArray` indexer; language and key phrase skillset with the enrichment tree; knowledge store projections (offline); governed queries with hit-level checks; shutdown and verify |
| 25–28 | **4 · Chunking and embeddings** | authored | Fixed, sentence and structure chunkers compared; cosine, dot product and normalisation; vector fields, HNSW and recall against exact KNN with real embeddings; integrated vectorization with index projections and a vectorizer (live) |
| 30–35 | 5 · Retrieval modes | planned | Vector, hybrid with RRF, semantic ranker, bake-off |
| 36–41 | 6 · Governance and security | planned | Server-side filters, security trimming, keyless RBAC, prompt injection in retrieved text |
| 42–46 | 7 · Evaluation | planned | Precision@5, Recall@5, NDCG, groundedness, held-out sets |
| 47–52 | 8 · Grounded answers (RAG API) | planned | Answer API with citations and abstention |
| 53–56 | 9 · React FAQ app | planned | FAQ UI with citations and safe rendering |
| 57–62 | 10 · Agent | planned | Search as an MCP tool, authorized actions, agentic retrieval |
| 63–66 | 11 · Operate and finish | planned | Tiers and capacity, shutdown and verify, capstone |
| 71–78 | **Advanced A1 · Agent engineering and MCP** | existing (was Lab 04, steps 22–29) | Tool schemas, the agent loop, retries and idempotency, planning, human approval, MCP server and client, agent evaluation |
| 79–86 | **Advanced A2 · Production AI** | existing (was Lab 05, steps 30–37) | Tenant isolation and ACLs, PII, injection defences, resilience, rate limits, safe caching, observability, release safety |
| 87–94 | **Advanced A3 · Architecture and interview drills** | existing (was Lab 06, steps 38–45) | Capacity, latency budgets, cost models, retrieval strategy, SLOs, FMEA, model selection, design review |

The advanced modules keep their original lessons (each with an interview question) until they are reworked to the step template. The pre-redesign course (Labs 01–06) is at commit `2ff7c3d` on `main`, to be tagged `v0-labs` by the owner.

## Modules 0–2 — welcome, search foundations and index design (local, free)

**Objective:** understand what the course builds and what it costs before anything exists; build lexical search from the inside (analyzer, inverted index, BM25); design and validate the governed Northbank index and the filters that enforce governance.

- **Setup:** `npm run setup`. **Run and test:** open steps 01–12, or `npm test`. Expected: every starter fails on `Not implemented: <function>`; every solution passes (7–9 tests per step).
- **Cost:** £0. No cloud resources, API keys or network calls; data is synthetic (`corpus.ts`). Nothing to clean up. Step 02 explains the paid steps' costs and shutdown before they are reached.
- **Limitations:** the tokenizer is a simplified standard tokenizer; BM25 scores will not equal Azure's `@search.score` (Azure computes per-shard statistics); the index validator and OData checker model a documented subset (common EDM types; no complex types, geography, `any`/`all` or functions). The service remains the authority.

## Modules 3–4 — provision and load, chunking and embeddings (live Azure, paid while running)

**Objective:** run the Northbank index on a real, keyless Azure AI Search service: provision it with Bicep, load it by push and by pull (Blob, `jsonArray`, skillset), query it with governance on every request, then chunk and embed content yourself and with integrated vectorization.

- **Extra prerequisites:** an Azure subscription; permission to create resource groups and role assignments in it (Owner, or Contributor plus User Access Administrator, at subscription scope); the [Azure CLI](https://aka.ms/azure-cli), signed in with `az login`. Lesson 17 covers all of it, including region and model configuration.
- **Run and test:** open steps 17–28, or `npm test`. Every step has **offline tests** (exact REST requests against a fake transport, always run) and, for 17–21, 23, 27 and 28, **live tests** that run only when `.azure/env.json` exists. Steps 22, 25 and 26 are offline only. Course acceptance and CI never call Azure (`ICODE_AZURE_LIVE=0`).
- **Limitations:** the indexer, enrichment-tree and knowledge-store functions in steps 20–22 are offline models for reasoning, not emulations of the service; the live runs on a real subscription are the evidence for service behaviour.

Run every Azure action from the workshop's **Actions** tab (group **Module 3 · Azure**). Set-up and shutdown ask you to type a confirmation in an Icode dialog. Each action is also an npm script you can run from a terminal in `course/`, where the same confirmation is a prompt. Confirmations guard against accidental and automated answers (piped or early input), not against a program on your machine that deliberately imitates Icode; see lesson 17.

```sh
npm run azure:prices   # live list prices for the configured region; no sign-in, creates nothing
npm run azure:plan     # checks your login, model availability and live list prices; creates nothing
npm run azure:up       # shows what will be created, then requires you to type "create"
npm run azure:status   # what is running and an estimate of the search cost so far
npm run azure:down     # deletes the course resource group after you type its name
npm run azure:verify   # confirms nothing from the course remains; only this clears the cost banner
```

A red cost banner shows on every lesson while course resources exist or may exist, and **"Cost status unknown"** when a check could not read the subscription. It is driven by marker files in `course/.azure/`. A copy of the record outside the course folder, watched by the `azure-cost-watch` sidecar, brings the banner back if `course/.azure/` is deleted. Only `azure:verify`, sweeping the recorded subscription by the course tag, clears it (lessons 17 and 23).

| What `azure:up` creates | How it is charged |
|---|---|
| Azure AI Search, Basic tier, 1 search unit, system-assigned identity | Every hour it exists, whether or not you use it. `azure:plan` shows the current list price for your region. |
| Semantic ranker, free plan; key phrase and language skills | Free allowances (the skills: 20 documents per indexer per day); beyond them, requests fail rather than being billed. |
| Azure OpenAI (S0) with an embedding deployment (`text-embedding-3-small`) and a chat deployment (`gpt-5-mini`) | Per token only; the modules use a small number of tokens. |
| Storage account (StorageV2, Standard LRS) with the `northbank-faq` container | Per GB stored and per operation; the course stores a few kilobytes. |
| Role assignments for you and for the search service's identity | Free. Keys are disabled on all three resources; every call uses a Microsoft Entra ID token. |

Everything goes into one resource group, tagged `course=senior-ai-engineer-labs`, `owner` and `expiresAt`. `azure:down` refuses to delete a group without that tag, deletes the whole group, purges the soft-deleted Azure OpenAI account and removes `.azure/env.json`; `azure:verify` then checks the subscription for anything left with the course tag, including the storage account. Deleting the resource group is what stops the charges: stopping the workshop or your computer does not. Budget alerts in Azure notify you; they do not stop spending.

Region and models are set in `azure/config.json` (default `swedencentral`). `azure:plan` refuses models that your region does not offer or that retire within a week; change the config if it does. List prices come from the public Azure Retail Prices API and may differ from your agreement.

## Advanced A1 — agent engineering and MCP (local, free; steps 71–78)

**Objective:** build a tool-using expenses assistant the way you would ship one — validated tool calls, a bounded loop, safe retries, explicit control flow, human approval for high-impact actions, MCP on both sides, and an evaluation suite that includes prompt injection through tool outputs.

- **Prerequisites and setup:** `npm run setup`. A1 adds two development dependencies, both pinned exactly in `package.json`: the official MCP TypeScript SDK, `@modelcontextprotocol/sdk` 1.32.2, and `zod` 4.6.7, which steps 76 and 77 import directly for tool schemas (the SDK also depends on it; declaring it avoids relying on a transitive install). The SDK is not small: it adds 93 packages to `package-lock.json` (Express, Hono, Ajv, jose and others for its HTTP transports and auth), although the lab uses only its in-memory transport.
- **Run and test:** open steps 71–78 in the workshop, or `npm test` for the whole course. Expected: every starter fails on `Not implemented`, every solution passes (8–11 tests per step).
- **Cost:** £0. Models are scripted fakes; MCP servers and clients talk over the SDK's `InMemoryTransport` (no process, port or network). No cloud resources are created, so there is nothing to clean up or verify afterwards.
- **Limitations:** no real model is called, so the lab proves the control code around a model, not a model's behaviour; the injection heuristics in step 78 are a teaching aid that paraphrased attacks will evade; step 77's client covers the handshake, capabilities, pagination and tool calls, not notifications, cancellation, sampling or HTTP transports.

## Advanced A2 — production AI (local; steps 79–86)

**Objective:** harden a RAG service for production in a regulated firm: enforce access in retrieval, keep PII out of prompts and logs, resist prompt injection and measure it, survive provider failures, share capacity fairly, cache safely, observe every request, and release changes behind metrics-driven rollback.

**Prerequisites:** the foundation modules; it references grounded prompts, orchestration and evaluation gates, which Modules 7–8 will teach (until then, see commit `2ff7c3d`, to be tagged `v0-labs`). **Setup:** none beyond `npm run setup`. **Cost:** £0 — no cloud resources, API keys or network calls; models, embeddings, clocks, IDs and randomness are injected fakes, so results are deterministic. Nothing is provisioned, so there is nothing to clean up.

**Run and check:** open steps 79–86 with `npm start`, or run `npm test`; each solution prints its Vitest summary (60 tests across the 8 steps) and each starter fails on `Not implemented`.

**Limitations:** the components are in-memory, single-process teaching implementations. Regex PII detection misses names and addresses, and placeholders can collide with user text that already looks like one; the injection scanner is a bypassable heuristic (the red-team suite shows a case it misses); rate limits and caches would need a shared store across instances; the tracer is a stand-in for OpenTelemetry. No results from real models or traffic are claimed.

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

Add `exercises/NN/` using an ID from your module's block in [`docs/course-step-map.md`](../docs/course-step-map.md), with `lab.json`, `README.md` and complete `problem/` and `solution/` projects, each with a `package.json` whose `test` script is `vitest`. Starters must fail with `Not implemented: <function>` errors, not setup errors; only the entry file may differ between `problem/` and `solution/`. Register the step in `course.json` under its `module-NN-…` module; step IDs are two digits and unique across the whole course (at most 100). See the engine's `docs/course-authoring.md`.

A foundation lesson has the sections `## Concept`, `## Theory`, `## Check questions`, `## Hands-on` and `## Recap and next`, in that order, then `## Further reading` with Microsoft Learn links for every Azure claim. Check questions are 3–5 fenced blocks:

````markdown
```question
prompt: Is semantic ranking the same as vector search?
options:
  - Yes
  - No, it reranks a candidate set from keyword or hybrid retrieval
answer: No, it reranks a candidate set from keyword or hybrid retrieval
explanation: >-
  Always explain why. Answers must match an option word for word when options are given.
source: handoff   # only for questions reconstructed from the study handoff
```
````

The review factory checks both rules on every pull request.

Tests are practice feedback that learners can read and edit; they are not tamper-resistant grading.
