# Senior AI Engineer Labs

A hands-on learning and portfolio repository for building **senior/principal-level AI engineering capability** through working labs, architectural decisions, interview drills and measurable evaluations.

## Goal

Learn to design, implement, explain, test and operate production AI systems—not merely memorise terminology. Each lab connects concise theory to a working implementation and demonstrates trade-offs through tests and evaluations.

Azure AI Search and RAG are the **first lab**, not the whole programme.

## Learning tracks

- **Azure AI Search:** indexing, indexers, chunking, embeddings, metadata, BM25, vector search, hybrid search, RRF and semantic reranking.
- **RAG engineering:** retrieval orchestration, context construction, citations, grounding and fallback behaviour.
- **Evaluations:** labelled datasets, Recall@K, Precision@K, MRR, NDCG@K, groundedness, relevance, correctness and regression testing.
- **Agent engineering:** tool calling, MCP, orchestration, multi-agent patterns and human oversight.
- **Production AI:** access control, document approvals, prompt injection, observability, resilience, performance, cost and CI/CD.
- **Architecture and interviews:** design trade-offs, failure scenarios, concise technical explanations and practical drills.

## Intended stack

- One shared **React + TypeScript** interface.
- **Fastify + TypeScript** backend with testable orchestration services.
- **Azure AI Search** for retrieval.
- **Azure OpenAI / Microsoft Foundry** for inference and supported evaluations.
- **Python** where appropriate for evaluation and ML experiments.
- Automated tests and CI for repeatable validation.

## First lab: Azure AI Search + RAG

1. Ingest a small synthetic document collection; chunk, embed and index it.
2. Add metadata such as `status`, `version` and `effectiveDate`.
3. Make approval metadata filterable and apply `status eq 'approved'` in backend queries.
4. Compare BM25, vector and hybrid search; explore semantic reranking.
5. Have the Fastify orchestrator retrieve authorised chunks and supply them as labelled, untrusted context to the LLM.
6. Return grounded answers and source citations to React.
7. Evaluate retrieval with Recall@5, Precision@5 and NDCG@10.
8. Evaluate generation separately for groundedness, relevance and correctness.
9. Document security controls, failure modes and architectural decisions.

**Important:** The backend enforces access and approval restrictions—not the LLM. Financial-services examples must use synthetic or publicly approved material.

## Lab format

Each lab should include:

- Concise theory and key concepts
- Architecture and trade-offs
- Runnable implementation
- Tests and evaluation results
- Interview questions and model answers
- Lessons learnt and follow-up improvements

## Proposed repository layout

```text
apps/
  web/                 # Shared React interface
  api/                 # Fastify API and orchestration
labs/
  01-azure-ai-search-rag/
  02-evaluation-engineering/
  03-agent-orchestration/
  04-mcp/
docs/
  architecture/
  interview-drills/
  learning-notes/
```

This is a proposed structure; code and folders will be added incrementally.

## Definition of done

A lab is complete when it runs locally, explains its design decisions, includes tests and appropriate evaluations, considers security and reliability, and provides an interview-ready explanation.

## Current status

Lab 01 phases 1–2 are available as an interactive [Icode Workshop](https://github.com/IcodeNet/Icode-workshop) course in [`course/`](course/README.md): eight TypeScript steps from chunking to RAG orchestration, run locally at no cost (`cd course && npm run setup && npm start`). Azure integration, the shared Fastify/React application and measured results are still to come. Quality and performance claims will be made only after measurement.
