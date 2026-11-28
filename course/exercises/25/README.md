# 25 · Why chunk: fixed, sentence-aware and structure-aware chunkers

*Module 4 · Chunking and embeddings · step 1 of 4 · Track: TypeScript*

## Concept

Module 3 indexed FAQ answers that came already split. Real content arrives as whole documents: guides, policies, PDFs. **Chunking** decides the unit of retrieval: what one search document, one embedding and one citation contain. Everything downstream, from recall to the answer's grounding, inherits that decision.

```text
whole guide (1,100 chars) ──► fixed 300        [An overdraft lets…] [ …costs 39.9% EAR var] [iable. Interest is…]   answer cut in two
                         ──► sentence 400     [3 whole sentences ] [3 whole sentences  ]                        sentences intact, sections mixed
                         ──► structure 500    [Overdrafts explained > How much an arranged overdraft costs ⏎ …]  one section, with its context
```

Why a senior engineer cares: a chunk that cuts an answer in half cannot be retrieved whole, and a chunk that mixes two topics is retrieved for both and helps with neither. No ranking model downstream fixes a bad unit of retrieval.

## Theory

**Why chunk at all.** Three reasons. *Targeting*: a query about card disputes should retrieve the dispute paragraph, not a 20-page card guide whose embedding averages every topic. *Model limits*: embedding models have input limits (8,000 tokens for the Azure OpenAI embedding skill), and long inputs dilute meaning. *Context budget*: the generator reads top-k chunks, so smaller, sharper chunks fit more evidence per token.

**Size and overlap are trade-offs, not constants.** Small chunks are precise but lose context ("it costs 2%": what does?) and multiply the number of vectors. Large chunks keep context but blur relevance and waste prompt space. **Overlap** repeats the end of one chunk at the start of the next, so a sentence near a boundary appears whole somewhere; the cost is duplicated storage and embeddings, and near-duplicate results. Microsoft's starting point for the Text Split skill is 2,000-character pages with 500 characters of overlap, adjusted by evaluation; for token units, about 512 tokens is a common recommendation. Characters are not tokens: English averages roughly four characters per token, but it varies.

**Three strategies.**

| Strategy | How | Strength | Weakness |
|---|---|---|---|
| Fixed | windows of N characters, step N − overlap | simple, predictable sizes | cuts words, sentences and answers anywhere |
| Sentence-aware | pack whole sentences up to N; optional sentence overlap | never cuts a sentence | crosses section boundaries; a long answer still spans chunks |
| Structure-aware | split at headings, then by sentence if a section is too long; prefix the heading path | chunks align with topics and carry their context | depends on documents having real structure |

The **heading prefix** ("Overdrafts explained > Going past your limit") is cheap context: it makes the chunk understandable on its own to BM25, to an embedding model and to the person reading a citation.

**Measure, do not guess.** This step's comparison counts how often a labelled answer falls entirely inside one chunk, and how much text is duplicated. On the Northbank guides, 300-character windows cut a quarter of the answers; overlap rescues them at a 25% duplication cost; structure-aware chunks keep all of them with none. Module 7 measures retrieval directly, with metrics on a labelled set.

**When not to chunk.** Short, self-contained records (the Module 3 FAQ answers, product rows) are already good retrieval units. Splitting them only loses context.

## Check questions

```question
prompt: Why chunk documents before indexing them for retrieval-augmented generation?
answer: To make retrieval units that match one topic, fit the embedding model's input limit and use the generator's context budget well; whole documents dilute relevance and often exceed model limits.
explanation: >-
  Chunking improves targeting of relevant passages and helps manage model context limits. Chunk size and overlap are
  engineering decisions to evaluate, not universal constants.
source: handoff
```

```question
prompt: You add 25% overlap to fixed 300-character chunks. What do you gain and what does it cost?
options:
  - Fewer chunks and lower cost, with the same recall
  - Answers near a boundary appear whole in some chunk, at the cost of more chunks, duplicated storage and embeddings, and near-duplicate hits
  - Nothing, because the embedding model ignores repeated text
answer: Answers near a boundary appear whole in some chunk, at the cost of more chunks, duplicated storage and embeddings, and near-duplicate hits
explanation: >-
  Overlap trades space and cost for boundary robustness. On the Northbank guides it lifted whole answers from 75% to
  100% for a quarter more indexed text. Whether that is worth it is an evaluation question.
```

```question
prompt: Why prefix a structure-aware chunk with its heading path?
answer: So the chunk carries its context when read alone, for keyword matching, for the embedding and for the person reading the citation, without copying the whole section.
explanation: >-
  "Cash withdrawals are free up to 200 pounds a month" is ambiguous without "Using your account abroad > Spending
  abroad". The prefix is a few words of context instead of a larger chunk.
```

```question
prompt: When is chunking the wrong choice?
answer: When records are already short and self-contained, such as FAQ answers or product rows; splitting them loses context and adds vectors without improving targeting.
explanation: >-
  The goal is a good retrieval unit. Sometimes the source already provides one, and the right chunker is the identity
  function.
```

## Hands-on

Implement in `index.ts` (offline). Every chunk keeps `start` and `end` offsets into the body, so a citation can point at the exact source text.

- `fixedChunks(body, size, overlap)`: windows stepping by `size − overlap`; `0 ≤ overlap < size`.
- `sentenceChunks(body, maxChars, overlapSentences)`: pack the sentences from the provided `sentences(body)`; carry the last sentences into the next chunk without exceeding the limit; split a single over-long sentence into fixed windows.
- `structureChunks(body, maxChars)`: split at Markdown headings, track the heading path, keep a section whole when it fits, otherwise sentence-chunk it, and prefix each chunk with `A > B` and a newline.
- `compareChunkers(documents, questions, strategies)`: per strategy, the chunk count, mean and maximum length, the share of labelled answers inside one chunk, and duplication.

`documents.ts` holds three whole Northbank guides and eight labelled questions.

## Recap and next

You can chunk by size, by sentence and by structure, and you can measure what each costs and keeps. **Next:** step 26 turns chunks into embeddings and compares them with cosine similarity and dot product.

## Further reading

- [Chunk large documents for RAG and vector search](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-chunk-documents)
- [Text Split skill (pages, overlap, units)](https://learn.microsoft.com/en-us/azure/search/cognitive-search-skill-textsplit)
- [Azure OpenAI Embedding skill (input limits)](https://learn.microsoft.com/en-us/azure/search/cognitive-search-skill-azure-openai-embedding)
