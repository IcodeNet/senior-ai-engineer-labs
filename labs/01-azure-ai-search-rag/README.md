# Lab 01 — Azure AI Search and RAG

## Purpose
Learn to design, build, evaluate and explain a production-minded retrieval and RAG system. The lab progresses from conceptual exercises and local tests to an optional, cost-controlled deployment in the learner's Azure playground subscription.

## Learning progression

### Phase 1 — Theory and interview drill (no Azure cost)
Study indexing, ingestion, chunking, embeddings, index schemas, approval metadata, BM25, vector search, hybrid search, RRF and semantic reranking. Answer scenario-based questions before implementation; record gaps and architectural trade-offs.

### Phase 2 — Local implementation (no Azure cost)
Use TypeScript, Fastify and Vitest to implement retrieval interfaces, synthetic documents, approval filtering, context assembly, citation handling and evaluation metrics. Use mocks or fixtures; no cloud credentials are needed. The shared React UI can exercise the lab through the Fastify API.

### Phase 3 — Azure playground integration (optional, potentially chargeable)
Before provisioning anything:
- Describe required services, region, SKU/tier, free-tier eligibility, quotas and expected cost drivers.
- Identify what may continue charging when idle. Do not assume that a stopped application means resources are free.
- Obtain the learner's explicit approval for chargeable deployment.
- Prefer an existing suitable playground resource or a free tier where actually available.
- Define a lab-specific resource group and consistent tags, including owner, lab ID and expiry.
- Provision through repeatable infrastructure-as-code where practical, with a documented destroy/cleanup command.

Use environment variables or local Azure CLI credentials rather than committed secrets. Example names (actual requirements depend on the chosen authentication method):

```dotenv
AZURE_SUBSCRIPTION_ID=
AZURE_TENANT_ID=
AZURE_RESOURCE_GROUP=
AZURE_LOCATION=
AZURE_SEARCH_ENDPOINT=
AZURE_SEARCH_INDEX_NAME=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_DEPLOYMENT=
```

Prefer Microsoft Entra ID / Azure CLI credentials where supported; if API keys are required, store them in an ignored local `.env` file or an appropriate secret store. Commit only `.env.example` with placeholders.

### Phase 4 — Experiments and measurements (potentially chargeable)
Ingest a small synthetic or publicly approved dataset. Apply backend-enforced `status eq 'approved'` filters, compare BM25, vector and hybrid retrieval, then test semantic reranking if available and affordable. Evaluate Precision@K, Recall@K, MRR and NDCG@K against labelled relevance data. Assemble untrusted source-labelled context, generate cited answers, and evaluate groundedness, relevance and correctness. Measure latency and token usage. Record model, service tier, query count, cost assumptions and actual usage where available.

### Phase 5 — Cleanup and review (mandatory after cloud exercises)
- Provide a documented, repeatable `cleanup` operation for all lab-owned resources.
- Show exactly what will be deleted before running it; never delete shared resources or the entire playground subscription.
- Confirm deletion succeeded and identify any retained resources or data.
- Explain which costs may remain, including usage already incurred or billing-reporting delays.
- Preserve results, test data, diagrams and lessons learnt locally or in Git; never preserve secrets.

## Cost and safety contract for every lab

Every lab README must state **estimated cost**, **free/local alternative**, **services created**, **cost drivers**, **setup**, **cleanup command**, **cleanup scope**, and **post-cleanup verification**. Where current Azure prices are unknown, label them **unverified** and require checking the Azure Pricing Calculator and subscription-specific pricing before deployment. Avoid blanket promises of zero cost. Set budget alerts where possible, but do not treat alerts as automatic spending caps.

## Lab content checklist

- Indexing and ingestion; approval governance and document revocation
- BM25, vector, hybrid, RRF and semantic reranking
- Secure retrieval filters and prompt-injection boundaries
- RAG orchestration, citations and abstention
- Retrieval evaluation: Precision@K, Recall@K, Hit Rate@K, MRR, MAP, NDCG@K
- Generation evaluation: groundedness, faithfulness, relevance and correctness
- Observability: P50/P95/P99 latency, errors, retries, cost and token usage
- Compliance and negative tests

Start with K=5, then compare K=10 and K=20 when useful. For every topic: interview question → knowledge-gap assessment → explanation → implementation → test → evaluation → engineering trade-offs.

## Definition of done
The lab runs locally, has repeatable tests and evaluation results, documents its Azure requirements and costs, protects credentials, includes cleanup for every chargeable resource, and can be explained at senior AI engineering interview level.

**Status:** Specification only. Infrastructure, application code and cleanup automation must be implemented and verified before this lab can be described as complete.
