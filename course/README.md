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

Steps 01–08 are **Lab 01, phases 1–2 (local)**; steps 09–16 are **Lab 02, evaluation engineering (local)**. Models, judges and retrievers are injected interfaces exercised with deterministic fakes. The course does not cover Azure AI Search itself, semantic reranking, real embeddings or real model calls; those belong to optional, cost-gated phases described in `labs/`. All teaching happens in this course; `labs/` holds specifications, infrastructure and results only.

## Verification

```sh
npm run typecheck     # strict TypeScript over every starter and solution
npm run validate      # engine course validation
npm test              # through the engine: every starter fails, every solution passes, learner journey
npm run test:browser  # real UI in Chromium (needs: npx playwright install chromium)
```

`npm test` writes `acceptance-results/icode.json`. CI (`course` job in `.github/workflows/ci.yml`) runs all of the above.

## Authoring a new step

Add `exercises/NN/` with `lab.json`, `README.md` (including an `## Interview question` section), and complete `problem/` and `solution/` projects, each with a `package.json` whose `test` script is `vitest`. Starters must fail with `Not implemented` errors, not setup errors. Add the step to `course.json`; step IDs are two digits and unique across the whole course (at most 100). See the engine's `docs/course-authoring.md`.

Tests are practice feedback that learners can read and edit; they are not tamper-resistant grading.
