# 05 · Why retrieval for AI

*Module 1 · Search foundations · step 1 of 3 · Track: TypeScript*

## Concept

A language model knows what it was trained on, up to a date, and nothing about Northbank's fees, today's policy or which answers compliance has approved. **Retrieval-augmented generation (RAG)** fixes that: for each question, retrieve a few relevant, permitted passages and give them to the model as evidence.

```text
question ──► governance filter ──► retrieve top k ──► pack into the context budget ──► model ──► answer + citations
                   ▲
                   └── approved, in force today; enforced on the server
```

Why a senior engineer cares: retrieval is where you control **what the model is allowed to know**. It decides relevance, freshness, permissions and cost per request. Azure AI Search is the retrieval layer in this course; the model only composes an answer from what Search returned.

## Theory

**Why not put everything in the prompt?** Three reasons, in order of how often they bite:

1. **Governance.** Stuffing the corpus into a prompt sends drafts, retired answers and documents the user may not see to the model. Filtering must happen before anything reaches it.
2. **Cost and latency.** You pay for every input token on every request, and long prompts are slower. Even when a model's context window is large, a support bot answering thousands of questions a day pays for it each time.
3. **Quality.** More context is not more signal. Irrelevant passages compete for the model's attention and give it more to misquote.

**Retrieval is a ranking problem under a budget.** You retrieve candidates, rank them, and keep what fits in a token budget, leaving room for instructions and the answer. Token counts depend on the model's tokenizer; "about four characters per English token" is a planning estimate, not a measurement.

**Filter before you rank.** If you rank first and filter afterwards, ineligible passages can take the top-k slots and push eligible ones out, so you return fewer good results or none. In Azure AI Search the filter runs as part of the query, so it narrows the candidates before ranking. In Module 4 and 5 you will meet vector queries, where Microsoft documents pre-filtering and post-filtering modes and their trade-offs.

**A naive retriever shows why the next steps exist.** Counting shared words finds "card replacement" but misses "when do I get my money back" for the refund answer: no word overlaps. Steps 06–07 make lexical search precise and ranked (analyzers, inverted index, BM25). Modules 4–5 add embeddings and hybrid search for paraphrases.

**When not to use retrieval.** If the answer is a fixed, small set (opening hours, a single policy), a lookup table or a deterministic workflow is cheaper, safer and testable. Use RAG when the corpus is large, changes, and must be cited.

## Check questions

```question
prompt: What does Azure AI Search do in a RAG system, and what does the model do?
options:
  - Search generates the answer; the model checks it
  - Search retrieves relevant, permitted passages; the model composes an answer from that evidence
  - Search stores embeddings; the model decides which documents are approved
answer: Search retrieves relevant, permitted passages; the model composes an answer from that evidence
explanation: >-
  Retrieval and generation are separate responsibilities. Search finds and filters evidence; the model writes the
  answer from it. Approval is a data property enforced in the query, never a decision delegated to the model.
source: handoff
```

```question
prompt: Your retriever ranks the whole corpus, takes the top 5, then removes drafts. A question's top 5 are all drafts. What does the user get?
answer: No evidence at all, even if approved answers ranked sixth and seventh.
explanation: >-
  Filtering after a top-k cut can starve the result set. Filter first so that every slot goes to an eligible
  passage. In Azure AI Search, put governance in the query's filter so the service applies it before returning the top results.
```

```question
prompt: A model has a very large context window. Why still retrieve?
answer: To keep unapproved content out, to cut per-request token cost and latency, and to give the model less irrelevant text to get wrong.
explanation: >-
  A large window removes one constraint (fit) but none of the others. Governance needs a filter, cost scales with
  input tokens on every request, and relevance improves when the evidence is focused.
```

```question
prompt: 'The question "When do I get my money back?" finds nothing with word overlap, although a refund answer exists. What does this show?'
answer: Lexical matching needs shared tokens; paraphrases need either analysis (stemming, synonyms) or semantic retrieval such as vectors.
explanation: >-
  This is the vocabulary mismatch problem. Steps 06–07 improve lexical search but it still matches tokens.
  Embeddings in Module 4 and hybrid retrieval in Module 5 address paraphrases, and evaluation in Module 7 measures
  whether they actually help.
```

## Hands-on

The Northbank FAQ is in `corpus.ts` (synthetic data). Implement in `index.ts`:

- `estimateTokens(text)`: `Math.ceil(characters / 4)`.
- `eligible(faq, today)`: approved, `effectiveDate` on or before today, and `expiryDate`, if present, on or after today. ISO dates compare correctly as strings.
- `overlapRetrieve(query, faqs, k)`: score each FAQ by the number of distinct query words in its title or text, drop zero scores, sort by score then id, keep `k`.
- `packContext(ranked, budget)`: take passages in rank order; skip any that would exceed the budget and keep going.
- `retrieveForPrompt(query, faqs, today, k, budget)`: filter, then retrieve, then pack.

One test asserts that the naive retriever **misses** a paraphrase. That is intended: it is the limitation the next steps fix.

## Recap and next

Retrieval exists to give the model permitted, relevant evidence within a budget. Governance comes first, ranking second, packing third. **Next:** step 06 builds what real lexical search runs on: tokenizers, analyzers and the inverted index.

## Further reading

- [Retrieval-augmented generation in Azure AI Search](https://learn.microsoft.com/en-us/azure/search/retrieval-augmented-generation-overview)
- [Filters in Azure AI Search](https://learn.microsoft.com/en-us/azure/search/search-filters)
- [Filters in vector queries](https://learn.microsoft.com/en-us/azure/search/vector-search-filters)
