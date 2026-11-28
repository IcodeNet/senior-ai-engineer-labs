# Course step-number map

Icode Workshop step IDs are two-digit folder names (`course/exercises/NN`), unique across the whole course, so a course has at most 100 IDs (`00`–`99`). Steps run in ascending ID order; gaps are allowed. Until the engine supports per-track step IDs (planned before the .NET track), every track shares these IDs.

[ADR 0005](architecture/0005-azure-ai-search-course-redesign.md) gives each foundation module a **fixed block** of IDs, so modules can be authored in parallel pull requests without changing each other's IDs, and puts the advanced modules after the foundation's whole range.

## Map

| IDs | Module | Status |
|---|---|---|
| 01–04 | Module 0 · Welcome | 01–02 authored |
| 05–09 | Module 1 · Search foundations | 05–07 authored |
| 10–16 | Module 2 · Index design | 10–12 authored |
| 17–24 | Module 3 · Provision and load (live) | 17–21 hold Lab 03 (real Azure, authored); the rest of Module 3 is planned |
| 25–29 | Module 4 · Chunking and embeddings | planned |
| 30–35 | Module 5 · Retrieval modes | planned |
| 36–41 | Module 6 · Governance and security | planned |
| 42–46 | Module 7 · Evaluation | planned |
| 47–52 | Module 8 · Grounded answers (RAG API) | planned |
| 53–56 | Module 9 · React FAQ app | planned |
| 57–62 | Module 10 · Agent | planned |
| 63–66 | Module 11 · Operate and finish | planned |
| 67–70 | spare (foundation growth) | – |
| 71–78 | Advanced A1 · Agent engineering and MCP | authored |
| 79–86 | Advanced A2 · Production AI | authored |
| 87–94 | Advanced A3 · Architecture and interview drills | authored |
| 95–99 | spare | – |

The foundation reserves 70 IDs for about 33 planned steps; the advanced modules use 24.

## Module IDs in `course.json`

Foundation modules are registered as `module-NN-<slug>` (for example `module-01-search-foundations`). The review factory uses that prefix to apply the step-template rule (five sections and 3–5 `question` blocks). Lab 03 (`lab-03-real-azure`) and the advanced modules (`advanced-a1-…`, `advanced-a2-…`, `advanced-a3-…`) use the interview-question lesson format and are exempt from the template rule.
