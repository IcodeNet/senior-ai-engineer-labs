# 30 · Tenant isolation and document ACLs

## Why it matters
Lab 05 hardens the RAG service from Labs 01–03 for production. The first rule: **a model can only leak what retrieval gave it.** If a credit analyst at one bank can retrieve another bank's documents, no prompt will stop the answer from containing them. Authorization belongs in the backend, never in the prompt.

In a multi-tenant assistant every document carries:

- `tenantId` — the customer it belongs to; a mismatch is always a deny;
- an **ACL** — the users and groups allowed to read it (synced from the source system's permissions);
- a **classification** — `public` < `internal` < `confidential` < `restricted`, compared with the principal's clearance.

**Deny by default**: a document with no ACL is readable by nobody, not everybody. A sync bug that drops ACLs then hides documents instead of publishing them.

Apply the rules twice (defence in depth, as in step 08):

1. **In the search filter**, so the index never returns what the user cannot read — and ranking, counts and facets do not leak either. In Azure AI Search this is an OData `$filter` over collection fields such as `aclGroups/any(g: g eq 'treasury')`.
2. **In code, on the results**, so a stale index, a missing filter or a provider bug is caught and audited before anything reaches the prompt.

Values in the filter come from the identity token, but still escape them: in OData a single quote is doubled (`o'neil` → `'o''neil'`).

All tenants, users and documents here are synthetic.

## Interview question
> A customer reports that the assistant summarised a document from another business unit. Walk through how you would find the cause, contain it, and prove it cannot happen again.

Think about: where authorization is enforced, ACL sync lag, caches (step 35), logs that show which document IDs were retrieved and dropped, and a regression test per tenant boundary.

## Your task
Implement in `index.ts`:

- `canRead(principal, doc)` — checks in this order: tenant mismatch (or empty tenant) → `{ allow: false, reason: "tenant" }`; no users **and** no groups in the ACL → `"no-acl"`; principal not in `acl.users` and none of their groups in `acl.groups` → `"not-listed"`; classification above clearance → `"clearance"`; otherwise `{ allow: true }`.
- `buildSecurityFilter(principal)` — exactly `tenantId eq '<tenant>' and (<grants>) and (<levels>)`, where grants are `aclUsers/any(u: u eq '<user>')` followed by `aclGroups/any(g: g eq '<group>')` for each group in sorted order, joined with ` or `, and levels are `classification eq '<level>'` for every level at or below the clearance, lowest first, joined with ` or `. Double single quotes. Throw if the principal has no tenant.
- `authorizeResults(principal, docs)` → `{ allowed, denied }`, keeping input order; `denied` holds `{ id, reason }`.

## Going further
Large groups make filters long; Azure AI Search's `search.in(field, 'a,b,c')` is faster for many values. Consider how to handle ACL changes between indexing runs (security trimming at query time from the source system), and how per-tenant indexes compare with a shared index plus filters for isolation, cost and noisy neighbours.
