# Course step-number map

Icode Workshop step IDs are two-digit folder names (`course/exercises/NN`), unique across the whole course, so a course has at most 100 IDs (`00`–`99`). Steps run in ascending ID order; gaps are allowed. Until the engine supports per-track step IDs (planned before the .NET track), every track shares these IDs.

The redesign ([ADR 0005](architecture/0005-azure-ai-search-course-redesign.md)) gives each foundation module a **fixed block** of IDs, so modules can be authored in parallel pull requests without renumbering each other, and puts the advanced modules after the foundation's whole range.

## Map

| IDs | Module | Status |
|---|---|---|
| 01–04 | Module 0 · Welcome | 01–02 authored |
| 05–09 | Module 1 · Search foundations | 05–07 authored |
| 10–16 | Module 2 · Index design | 10–12 authored |
| 17–24 | Module 3 · Provision and load (live) | 17–21 hold Lab 03 (real Azure, unchanged) until Module 3 absorbs it |
| 25–29 | Module 4 · Chunking and embeddings | planned |
| 30–35 | Module 5 · Retrieval modes | planned |
| 36–41 | Module 6 · Governance and security | planned |
| 42–46 | Module 7 · Evaluation | planned |
| 47–52 | Module 8 · Grounded answers (RAG API) | planned |
| 53–56 | Module 9 · React FAQ app | planned |
| 57–62 | Module 10 · Agent | planned |
| 63–66 | Module 11 · Operate and finish | planned |
| 67–70 | spare (foundation growth) | – |
| 71–78 | Advanced A1 · Agent engineering and MCP (was Lab 04, steps 22–29) | content unchanged |
| 79–86 | Advanced A2 · Production AI (was Lab 05, steps 30–37) | content unchanged |
| 87–94 | Advanced A3 · Architecture and interview drills (was Lab 06, steps 38–45) | content unchanged |
| 95–99 | spare | – |

The foundation reserves 70 IDs for about 33 planned steps; the advanced modules use 24.

## Old to new

| Old (commit `2ff7c3d`, to be tagged `v0-labs`) | New |
|---|---|
| Lab 01, steps 01–08 | removed; replaced by Modules 1–2 (BM25 now step 07). Its other topics (chunking, vectors, RRF, grounded prompts, metrics, orchestration) are planned in Modules 4–8. |
| Lab 02, steps 09–16 | removed; its topics (datasets, harness, groundedness, judge, calibration, bootstrap, CI gates, cost) are planned in Modules 7 and 11. |
| Lab 03, steps 17–21 | unchanged IDs and content; positioned after Module 2 as Module 3's predecessor. |
| Lab 04, steps 22–29 | steps 71–78 (ID + 49) |
| Lab 05, steps 30–37 | steps 79–86 (ID + 49) |
| Lab 06, steps 38–45 | steps 87–94 (ID + 49) |

Cross-references inside the moved lessons were renumbered; references to removed Lab 01–02 lessons now point at the module that will teach the topic. The pre-redesign course is at commit `2ff7c3d`; the owner will create tag `v0-labs` there.

## Module IDs in `course.json`

Foundation modules are registered as `module-NN-<slug>` (for example `module-01-search-foundations`). The review factory uses that prefix to apply the step-template rule (five sections and 3–5 `question` blocks). Lab 03 (`lab-03-real-azure`) and the advanced modules (`advanced-a1-…`, `advanced-a2-…`, `advanced-a3-…`) are exempt until they are reworked to the template.
