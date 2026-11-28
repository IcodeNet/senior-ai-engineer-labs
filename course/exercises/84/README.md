# 84 · Semantic caching with invalidation and safety

## Why it matters
Hundreds of staff ask the same policy questions in slightly different words. A **semantic cache** embeds the question and returns a stored answer when a new question is close enough, saving a full retrieve-and-generate round trip — often the biggest single cut in cost and P95 latency (Module 11).

It is also an easy way to build a data leak or serve wrong answers. A safe cache has:

- **A security scope in the key, and re-authorization on every hit.** An answer is only reusable by someone who could have produced it. The key partitions by tenant, permission groups, **clearance** (step 79), model and prompt version — but step 79 also grants documents to **individual users**, and two colleagues with identical groups and clearance can still differ there. So a hit is only served after checking that the requesting user can read **every cited source** (step 79's `canRead`); otherwise it is a miss for them (and stays cached for those who can). Without this, an answer grounded in a document shared with one person is served to the whole team.
- **A similarity threshold**, tuned on labelled pairs. Too low and "Can I fly business class?" returns the answer to "Can I expense business class?"; too high and the hit rate is near zero. Exact matches after normalisation always hit.
- **Expiry (TTL)** as a backstop, and **invalidation** on change: each entry records the document IDs and versions it cited; a new version, a deletion or a revocation makes the entry stale.
- **Things you never store**: answers that depend on the user (their limits, their accounts), answers without sources (abstentions, ungrounded text), and questions or answers that contain PII — raw or as step 80 placeholders. The cache keeps a **hash** of the normalised question for exact matches, not its text. The embedding stays, and embeddings can be partly inverted, so treat the cache store as sensitive data with its own retention.

The embedding in the tests is a toy concept counter so the arithmetic is visible; in production you would reuse the query embedding you already compute for vector search.

## Interview question
> After launching a semantic cache, the hit rate is 35% and costs fell, but a compliance review finds a user received an answer citing a document their group cannot access. What went wrong and how do you redesign the cache?

Think about: what is in the cache key, permission-group fingerprints vs. per-user caches, invalidation on ACL changes, re-checking authorization on a hit, and measuring wrong-hit rate as well as hit rate.

## Your task
Implement in `index.ts`:

- `normalizeQuestion(q)` — lower-case, collapse whitespace, trim, strip trailing `?`, `!` and `.` characters (then trim again).
- `scopeKey(scope)` — `tenantId|groups sorted and joined with ","|clearance|model|promptVersion`.
- `cosine(a, b)` — dot product over the product of norms; `0` when either norm is 0; `RangeError` when lengths differ.
- `SemanticCache.set(scope, question, answer, { personalised })` — refuse with reason `"personalised"`, `"ungrounded"` (no sources) or `"contains-pii"` (`containsPii`, given, is true for the question or the answer text); otherwise store `{ questionHash: hashQuestion(normalised), vector: embed(normalised), answer, storedAt: now() }` in the scope, replacing any entry with the same hash. `hashQuestion` and `entriesFor` are given.
- `SemanticCache.get(scope, question, canRead)` — among entries in the **same scope**, pick the best similarity (an entry with the same question hash scores 1, otherwise cosine of embeddings). Below `threshold` → `{ hit: false, reason: "miss" }`. If `now() − storedAt ≥ ttlMs` remove it and return `"expired"`; if any cited source's `currentVersion(id)` differs from the stored version (including `undefined`) remove it and return `"stale"`; if `canRead(id)` is false for any cited source return `"forbidden"` **without** removing the entry (log the reason internally, but return a plain miss at the API boundary: telling a user "forbidden" reveals that a colleague asked this question); otherwise `{ hit: true, answer, similarity }`.
- `SemanticCache.invalidateDocument(docId)` — remove every entry, in every scope, that cites `docId`; return the number removed.

## Going further
Tune the threshold on labelled question pairs and report the wrong-hit rate, cap entries per scope with LRU eviction, subscribe to index updates to invalidate automatically, and cache retrieval results separately from generated answers.
