import { test } from "vitest";
import assert from "node:assert/strict";
import { ChunkStore, currentChunks, isEligible, type Chunk } from "./index.ts";

const now = new Date("2026-11-27T12:00:00Z");
const chunk = (over: Partial<Chunk>): Chunk => ({
  id: "travel#0",
  docId: "travel",
  text: "Book economy for flights under six hours.",
  status: "approved",
  version: 1,
  effectiveDate: "2026-01-01",
  ...over,
});
const ids = (chunks: Chunk[]) => chunks.map((c) => c.id).sort();

test("only approved chunks that are already effective are eligible", () => {
  assert.equal(isEligible(chunk({}), now), true);
  assert.equal(isEligible(chunk({ effectiveDate: "2026-11-27T12:00:00Z" }), now), true);
  assert.equal(isEligible(chunk({ status: "draft" }), now), false);
  assert.equal(isEligible(chunk({ status: "revoked" }), now), false);
  assert.equal(isEligible(chunk({ effectiveDate: "2027-01-01" }), now), false);
});

test("a newer approved version supersedes the older one", () => {
  const result = currentChunks(
    [
      chunk({ id: "travel@1#0", version: 1 }),
      chunk({ id: "travel@1#1", version: 1 }),
      chunk({ id: "travel@2#0", version: 2 }),
    ],
    now,
  );
  assert.deepEqual(ids(result), ["travel@2#0"]);
});

test("an unpublished newer version leaves the approved version authoritative", () => {
  const result = currentChunks(
    [
      chunk({ id: "travel@1#0", version: 1 }),
      chunk({ id: "travel@2#0", version: 2, status: "draft" }),
      chunk({ id: "travel@3#0", version: 3, effectiveDate: "2027-03-01" }),
    ],
    now,
  );
  assert.deepEqual(ids(result), ["travel@1#0"]);
});

test("versions are resolved per document", () => {
  const result = currentChunks(
    [chunk({ id: "travel#0", version: 4 }), chunk({ id: "expenses#0", docId: "expenses", version: 1 })],
    now,
  );
  assert.deepEqual(ids(result), ["expenses#0", "travel#0"]);
});

test("re-indexing a document replaces its previous chunks", () => {
  const store = new ChunkStore();
  store.upsert([chunk({ id: "travel#0" }), chunk({ id: "travel#1" }), chunk({ id: "gifts#0", docId: "gifts" })]);
  store.upsert([chunk({ id: "travel#0", text: "Book economy for all flights.", version: 2 })]);
  const result = store.eligible(now);
  assert.deepEqual(ids(result), ["gifts#0", "travel#0"]);
  assert.equal(result.find((c) => c.docId === "travel")?.text, "Book economy for all flights.");
});

test("revocation removes every chunk of the document", () => {
  const store = new ChunkStore();
  store.upsert([chunk({ id: "travel#0" }), chunk({ id: "travel#1" }), chunk({ id: "gifts#0", docId: "gifts" })]);
  store.revoke("travel");
  assert.deepEqual(ids(store.eligible(now)), ["gifts#0"]);
});

test("drafts in the store are never returned", () => {
  const store = new ChunkStore();
  store.upsert([chunk({ id: "draft#0", docId: "draft", status: "draft" })]);
  assert.deepEqual(store.eligible(now), []);
});
