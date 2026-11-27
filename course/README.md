# Senior AI Engineer Labs — Icode Workshop course

The interactive course for this repository, run with [Icode Workshop](https://github.com/IcodeNet/Icode-workshop). Each step pairs a short lesson and an interview question with a TypeScript exercise: a failing starter (`problem/`), Vitest tests, and a reference solution (`solution/`).

## Prerequisites

- Node.js 22.13 or later (with npm and Corepack)
- Git

Labs 01, 02, 05 and 06 use no cloud account, API key or paid service. Estimated cost: **£0**. Lab 03 is the exception; see below.

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
| 22 | Tool schemas and argument validation | JSON Schema argument validation, model-actionable errors, tool-definition lint |
| 23 | The tool-calling loop with step limits | Model → validate → run → feed back, with step, tool-call and repeated-call limits |
| 24 | Tool errors, retries and idempotency | Error classification, capped backoff with Retry-After, idempotency keys and replay |
| 25 | Planning vs reactive agents: an explicit state machine | Plan validation, dependency order, pure reducer, bounded replanning |
| 26 | Human-in-the-loop approval for high-impact tools | Impact policy, approvals bound to exact arguments, four-eyes, expiry, single use, audit |
| 27 | Building an MCP server: tools, resources and prompts | `McpServer` with tools, a resource template and a prompt, tested over `InMemoryTransport` |
| 28 | An MCP client: handshake and capability negotiation | Raw JSON-RPC initialize, version check, capability gating, pagination, tool vs protocol errors |
| 29 | Agent evaluation and prompt injection through tool outputs | Trajectory scoring, tool-use precision/recall, quarantine, injection suite |
| 30 | Tenant isolation and document ACLs | Deny-by-default tenant, ACL and clearance checks (unknown levels deny); escaped OData security filter; post-filter audit |
| 31 | PII detection and redaction | Luhn and IBAN mod-97 validation, card windows, overlap resolution, reversible typed placeholders |
| 32 | Prompt-injection defences and a red-team harness | Injection scanner, quarantine, canary and link-allowlist output checks, attack success rate |
| 33 | Resilience: timeouts, retries, circuit breaker, fallback | Abortable timeouts, transient-error classification, full-jitter backoff, circuit breaker, degraded fallback |
| 34 | Rate limits and token budgets per user | Token bucket with `Retry-After`, daily token budgets with reserve and settle |
| 35 | Semantic caching with invalidation and safety | Scope keys with clearance, per-user re-authorization on hits, hashed questions, PII refusal, TTL, staleness, invalidation |
| 36 | Observability: traces, token attributes and safe logs | Spans with GenAI token attributes, trace summary, allow-listed structured logs with HMAC pseudonyms and masking |
| 37 | Release safety: canary, shadow and rollback | Sticky per-release canary, shadow agreement, guardrail-based promote/hold/rollback, rollout stages |
| 38 | Capacity and token-throughput estimation | Tokens per request, peak TPM/RPM, Little's-law concurrency, deployments by binding limit |
| 39 | Latency budgets and P95 composition | End-to-end P95 from traces with parallel stages, budget allocation, breach report |
| 40 | Cost models: RAG vs fine-tuning vs long context | Fixed and variable cost per architecture, ranking by volume, break-even volume |
| 41 | Choosing a retrieval strategy from requirements | Decision function with reranker, controls and reason codes |
| 42 | SLOs and error budgets for AI features | Availability, latency and quality SLOs, error budgets, multi-window burn-rate paging |
| 43 | Failure-mode and effects analysis for an AI pipeline | RPN scoring, severity override, residual risk after mitigations |
| 44 | Build vs buy and model selection scorecards | Hard constraints, weighted min-max scores, weight sensitivity |
| 45 | System-design review: find the missing controls | Residency, approval, audit, PII, injection, cost-cap and access-control checks, verdict |

Steps 01–08 are **Lab 01, Azure AI Search and RAG concepts (local)** and steps 09–16 are **Lab 02, evaluation engineering (local)**: models, judges and retrievers are deterministic fakes and cost nothing. Steps 17–21 are **Lab 03, real Azure**: the same ideas against real Azure AI Search and Azure OpenAI, with setup and shutdown commands. Steps 22–29 are **Lab 04, agent engineering and MCP (local)**: tools, the agent loop, retries and idempotency, planning, human approval, an MCP server and client, and agent evaluation with prompt-injection cases. Models are scripted fakes and MCP runs over the official SDK's in-memory transport, so it costs nothing and needs no API key. Steps 30–37 are **Lab 05, production AI (local)**: authorization, PII, prompt injection, resilience, rate limits, caching, observability and release safety around the same RAG service, with deterministic fakes for models, clocks and randomness, so it costs nothing. Steps 38–45 are **Lab 06, architecture and interview drills (local)**: each turns a senior design judgement (capacity, latency, cost, retrieval choice, SLOs, FMEA, model selection, design review) into a tested function, and each lesson adds a model answer outline to its interview question; they cost nothing. All teaching happens in this course.

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

## Lab 04 — agent engineering and MCP (local, free)

**Objective:** build a tool-using expenses assistant the way you would ship one — validated tool calls, a bounded loop, safe retries, explicit control flow, human approval for high-impact actions, MCP on both sides, and an evaluation suite that includes prompt injection through tool outputs.

- **Prerequisites and setup:** the same as Labs 01–02 (`npm run setup`). Lab 04 adds two development dependencies, both pinned exactly in `package.json`: the official MCP TypeScript SDK, `@modelcontextprotocol/sdk` 1.32.2, and `zod` 4.6.7, which steps 27 and 28 import directly for tool schemas (the SDK also depends on it; declaring it avoids relying on a transitive install). The SDK is not small: it adds 93 packages to `package-lock.json` (Express, Hono, Ajv, jose and others for its HTTP transports and auth), although the lab uses only its in-memory transport.
- **Run and test:** open steps 22–29 in the workshop, or `npm test` for the whole course. Expected: every starter fails on `Not implemented`, every solution passes (8–11 tests per step).
- **Cost:** £0. Models are scripted fakes; MCP servers and clients talk over the SDK's `InMemoryTransport` (no process, port or network). No cloud resources are created, so there is nothing to clean up or verify afterwards.
- **Limitations:** no real model is called, so the lab proves the control code around a model, not a model's behaviour; the injection heuristics in step 29 are a teaching aid that paraphrased attacks will evade; step 28's client covers the handshake, capabilities, pagination and tool calls, not notifications, cancellation, sampling or HTTP transports.

## Lab 05 — production AI (local)

**Objective:** harden a RAG service for production in a regulated firm: enforce access in retrieval, keep PII out of prompts and logs, resist prompt injection and measure it, survive provider failures, share capacity fairly, cache safely, observe every request, and release changes behind metrics-driven rollback.

**Prerequisites:** Labs 01–02 (steps 06, 08, 14–16 are referenced). **Setup:** none beyond `npm run setup`. **Cost:** £0 — no cloud resources, API keys or network calls; models, embeddings, clocks, IDs and randomness are injected fakes, so results are deterministic. Nothing is provisioned, so there is nothing to clean up.

**Run and check:** open steps 30–37 with `npm start`, or run `npm test`; each solution prints its Vitest summary (60 tests across the 8 steps) and each starter fails on `Not implemented`.

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

Add `exercises/NN/` with `lab.json`, `README.md` (including an `## Interview question` section), and complete `problem/` and `solution/` projects, each with a `package.json` whose `test` script is `vitest`. Starters must fail with `Not implemented` errors, not setup errors. Add the step to `course.json`; step IDs are two digits and unique across the whole course (at most 100). See the engine's `docs/course-authoring.md`.

Tests are practice feedback that learners can read and edit; they are not tamper-resistant grading.
