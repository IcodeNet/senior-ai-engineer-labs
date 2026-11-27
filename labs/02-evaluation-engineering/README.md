# Lab 02 — Evaluation engineering

## Purpose
Make AI quality measurable and enforceable: build trustworthy labelled datasets, evaluate retrieval and generation, measure how far an LLM judge can be trusted, decide whether a change is a real improvement, gate regressions in CI and account for cost and latency.

All teaching for this lab is in the Icode Workshop course, steps **09–16** (`course/`). This file is the specification and contract.

## Objectives
- Validate golden datasets and split them deterministically without leakage (09).
- Run a retrieval evaluation harness with per-query diagnostics and K comparison (10).
- Check citations and groundedness with cheap deterministic checks (11).
- Use an LLM judge with strict structured output, bounded retries and position-bias detection (12).
- Calibrate a judge against human labels: agreement, Cohen's κ and false-pass rate (13).
- Compare systems with a seeded paired bootstrap confidence interval (14).
- Gate quality, latency and cost regressions against a ratcheting baseline (15).
- Compute cost per query, latency percentiles and budget compliance (16).

## Prerequisites
Node.js 22.13+, Git. Lab 01 steps 06–07 are useful background.

## Setup, run and test
```sh
cd course
npm run setup && npm start     # learn: http://127.0.0.1:5173, steps 09–16
npm test                       # verify every step through the Icode engine
```
Expected output of `npm test`: steps 09–16 report the starter as `failed` and the solution as `passed`, followed by `Acceptance passed`.

## Costs and resources
- Local phase: **£0**. No cloud resources, API keys or model calls; judges, models and retrievers are deterministic fakes. Prices in step 16 are placeholders, not real pricing.
- Provisioned resources: none. Cleanup: none required; `.workshop/` holds local learner state and can be deleted.

## Free/local alternatives and later phases (not implemented)
A real LLM judge (Azure OpenAI / AI Foundry evaluators or a local model via an OpenAI-compatible endpoint) and evaluation of the Lab 01 pipeline against a real index are possible later phases. They may be chargeable and require a cost estimate and explicit approval before any provisioning.

## Limitations
- Lexical groundedness (11) is a proxy: it misses paraphrase and contradiction.
- Judge behaviour (12–13) is simulated; real judge reliability must be measured on real labels.
- Tests are practice feedback that learners can read and edit, not tamper-resistant grading.

**Status:** In progress. Local steps 09–16 exist; real-model judging, real evaluation runs and measured results are not implemented.
