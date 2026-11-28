# Course step-number map

Icode Workshop step IDs are two-digit folder names (`course/exercises/NN`), unique across the whole course, so a course has at most 100 IDs (`00`–`99`). Steps run in ascending ID order; gaps are allowed. Until the engine supports per-track step IDs (planned before the .NET track), every track shares these IDs.

Each foundation module has a **fixed block** of IDs ([ADR 0005](architecture/0005-azure-ai-search-course-redesign.md)), so modules can be authored in parallel pull requests independently, and the advanced modules come after the foundation's whole range.

## Map

| IDs | Module | Status |
|---|---|---|
| 01–04 | Module 0 · Welcome | 01–02 authored |
| 05–09 | Module 1 · Search foundations | 05–07 authored |
| 10–16 | Module 2 · Index design | 10–12 authored |
| 17–24 | Module 3 · Provision and load (live) | 17–23 authored (24 spare) |
| 25–29 | Module 4 · Chunking and embeddings | 25–28 authored (29 spare) |
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

## Modules 3 and 4

| Step | Teaches | Live Azure |
|---|---|---|
| 17 | Tiers, search units, what bills, semantic ranker plans; review the search service definition; service limits | `servicestats` |
| 18 | Deploy the Northbank index; update in place or rebuild into a new version behind an alias | create and read back the index |
| 19 | Push API: actions, batching limits, one key per request, 207 and retries | push the corpus, merge a field |
| 20 | Pull pipeline: keyless Blob data source, `jsonArray` indexer, one-to-many keys, run and poll | upload, index, count |
| 21 | Skillset: language detection and key phrases, enrichment tree, dependency order, output field mappings | enriching indexer |
| 22 | Knowledge store: table, object and file projections, `/document/...` sources, lifecycle | none (offline model) |
| 23 | Governed queries: parameters, facets, highlights, hit-level governance check; shutdown and verify | governed queries |
| 25 | Chunking: fixed, sentence-aware and structure-aware chunkers, size and overlap, comparison | none |
| 26 | Embeddings: dot product, cosine, normalisation, Euclidean; model and dimensions must match | none |
| 27 | Vector fields, HNSW parameters, profiles, exhaustive KNN and recall@k; embed and load real vectors | embed, merge vectors, vector query |
| 28 | Integrated vectorization: Text Split, Azure OpenAI Embedding, index projections, vectorizer | chunk, embed and query in the service |

## Module IDs in `course.json`

Foundation modules are registered as `module-NN-<slug>` (for example `module-01-search-foundations`). The review factory uses that prefix to apply the step-template rule (five sections and 3–5 `question` blocks) to every foundation step, Modules 3 and 4 included. The advanced modules (`advanced-a1-…`, `advanced-a2-…`, `advanced-a3-…`) keep one interview question per lesson.
