# 02 · Approved, current documents only

## Why it matters
In regulated domains a draft policy, a superseded version or a revoked notice must **never** reach the model — not even as "context the model is told to ignore". Prompt instructions are not an access-control mechanism. The backend decides which chunks are eligible, and the LLM only ever sees that set.

In Azure AI Search this is a filter such as `status eq 'approved' and effectiveDate le 2026-11-27T00:00:00Z`, applied by the API on every query (never taken from user input). Versioning is subtler: if v2 and v3 of a policy are both approved, only v3 should answer — but if v3 is still a draft, v2 remains authoritative.

## Interview question
> A user asks the assistant about the travel policy and gets an answer quoting a draft that was never published. Walk through where the control failed and how you would prevent and detect it.

Think about: filters enforced server-side, metadata on every chunk, revocation latency in the index, and negative tests that prove denial.

## Your task
Implement in `index.ts`:

- `isEligible(chunk, now)` — `status` is `approved` and `effectiveDate` is on or before `now`.
- `currentChunks(chunks, now)` — eligible chunks, keeping only the **highest eligible version** of each document.
- `ChunkStore`:
  - `upsert(chunks)` replaces every stored chunk of the documents being upserted (re-indexing a document drops its old chunks).
  - `revoke(docId)` removes the document completely.
  - `eligible(now)` returns `currentChunks` of what is stored.

## Going further
Revocation in a real index is eventually consistent — indexers run on schedules. Senior designs add a deny-list checked at query time, or a short-lived cache, so revocation is immediate even before the index catches up.
