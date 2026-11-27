# 01 · Chunking with governance metadata

## Why it matters
Search indexes retrieve **chunks**, not documents. Chunk size decides what an LLM can see: too large and the relevant sentence is diluted (and costs tokens); too small and it loses the surrounding context that makes it meaningful. Overlap keeps a sentence that straddles a boundary retrievable from either side.

Every chunk must also carry the document's governance metadata — `status`, `version`, `effectiveDate`. Azure AI Search filters on fields stored **on each indexed chunk**; if the metadata stays on the parent document, the backend cannot enforce approval at query time.

## Interview question
> You chunk policies at 512 tokens with 0 overlap and users complain answers miss key clauses. What do you change, and how would you prove it helped?

Think about: overlap, structure-aware splitting (headings, clauses), and measuring with Recall@K on a labelled set (step 07) rather than eyeballing.

## Your task
Implement in `index.ts`:

- `tokenize(text)` — split on whitespace; no empty tokens.
- `chunkDocument(doc, { size, overlap })` — word windows of `size`, each starting `size - overlap` words after the previous.
  - Throw `RangeError` unless `size` is a positive integer and `0 <= overlap < size`.
  - Stop once a window reaches the end of the document — no trailing chunk that is already fully covered.
  - An empty document produces no chunks.
  - Chunk IDs are `<docId>#<chunkIndex>`; copy `title`, `status`, `version` and `effectiveDate` onto every chunk.

Run the tests; they fail until the implementation is complete.

## Going further
Real systems split by tokens (the model's tokenizer), respect document structure, and store parent IDs so a UI can show the surrounding section. Azure AI Search's *Text Split* skill does page/sentence chunking in an indexer pipeline.
