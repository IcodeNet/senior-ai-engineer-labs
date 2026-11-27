import { test } from "vitest";
import assert from "node:assert/strict";
import { containsPii, cosine, hashQuestion, normalizeQuestion, scopeKey, SemanticCache, type CacheScope, type Embed } from "./index.ts";

// A deterministic toy embedding: counts of concept words, with simple synonyms folded together.
const CONCEPTS: Record<string, string> = {
  travel: "travel", trip: "travel", trips: "travel",
  flight: "flight", flights: "flight", fly: "flight", flying: "flight",
  business: "business", class: "class",
  expense: "expense", expenses: "expense", receipt: "receipt", receipts: "receipt",
  fx: "fx", settlement: "settlement", cutoff: "cutoff",
};
const AXES = [...new Set(Object.values(CONCEPTS))];
const embed: Embed = (text) => {
  const vector = AXES.map(() => 0);
  for (const word of text.toLowerCase().split(/[^a-z]+/)) {
    const concept = CONCEPTS[word];
    if (concept) vector[AXES.indexOf(concept)] += 1;
  }
  return vector;
};

const scope: CacheScope = { tenantId: "northbank", groups: ["travel-desk", "all-staff"], clearance: "internal", model: "chat-v1", promptVersion: "p3" };
const anyone = () => true;
const answer = { text: "Business class is allowed on flights over 6 hours [S1].", sources: [{ id: "travel-policy", version: 4 }] };

function setup(start = 0) {
  let clock = start;
  const versions = new Map([["travel-policy", 4], ["expenses-policy", 2]]);
  const cache = new SemanticCache({ embed, threshold: 0.9, ttlMs: 3_600_000, now: () => clock, currentVersion: (id) => versions.get(id) });
  return { cache, versions, tick: (ms: number) => (clock += ms) };
}

test("questions are normalised and scope keys ignore group order", () => {
  assert.equal(normalizeQuestion("  Can I fly   BUSINESS class?? "), "can i fly business class");
  assert.equal(scopeKey(scope), "northbank|all-staff,travel-desk|internal|chat-v1|p3");
  assert.equal(scopeKey({ ...scope, groups: ["all-staff", "travel-desk"] }), scopeKey(scope));
  assert.equal(cosine([1, 0], [0, 0]), 0);
  assert.throws(() => cosine([1], [1, 2]), RangeError);
});

test("a paraphrase in the same scope is a hit; an unrelated question is a miss", () => {
  const { cache } = setup();
  assert.deepEqual(cache.set(scope, "Can I fly business class on long flights?", answer), { stored: true });
  const hit = cache.get(scope, "Is business class allowed when flying?", anyone);
  assert.equal(hit.hit, true);
  assert.ok(hit.hit && hit.similarity >= 0.9 && hit.answer === answer);
  assert.deepEqual(cache.get(scope, "Do expenses need receipts?", anyone), { hit: false, reason: "miss" });
  assert.deepEqual(cache.get(scope, "  CAN I FLY BUSINESS CLASS ON LONG FLIGHTS ", anyone), { hit: true, answer, similarity: 1 });
});

test("answers never cross tenant, group, clearance, model or prompt-version boundaries", () => {
  const { cache } = setup();
  cache.set(scope, "Can I fly business class?", answer);
  for (const other of [
    { ...scope, tenantId: "southbank" },
    { ...scope, groups: ["all-staff"] },
    { ...scope, clearance: "public" },
    { ...scope, model: "chat-v2" },
    { ...scope, promptVersion: "p4" },
  ])
    assert.deepEqual(cache.get(other, "Can I fly business class?", anyone), { hit: false, reason: "miss" });
});

test("a hit is re-authorized for the requesting user: same groups and clearance, different document grants", () => {
  // Step 30's model: the memo's ACL names u-ana only. u-ben shares every group and the clearance, so the scope key matches.
  const acl: Record<string, string[]> = { "travel-policy": ["u-ana", "u-ben"], "ana-memo": ["u-ana"] };
  const readerFor = (userId: string) => (docId: string) => acl[docId]?.includes(userId) ?? false;
  const { cache, versions } = setup();
  versions.set("ana-memo", 1);
  const memoAnswer = { text: "Your exception allows business class [S1] [S2].", sources: [{ id: "travel-policy", version: 4 }, { id: "ana-memo", version: 1 }] };
  cache.set(scope, "Can I fly business class?", memoAnswer);
  assert.equal(cache.get(scope, "Can I fly business class?", readerFor("u-ana")).hit, true);
  assert.deepEqual(cache.get(scope, "Can I fly business class?", readerFor("u-ben")), { hit: false, reason: "forbidden" });
  assert.equal(cache.get(scope, "Can I fly business class?", readerFor("u-ana")).hit, true, "a forbidden lookup must not evict the entry");
  assert.deepEqual(cache.get(scope, "Can I fly business class?", readerFor("u-unknown")), { hit: false, reason: "forbidden" });
});

test("an identical question hits even when its embedding carries no signal", () => {
  const { cache } = setup();
  cache.set(scope, "Who signs off wires above the limit?", answer);
  assert.deepEqual(embed("who signs off wires above the limit").every((x) => x === 0), true);
  assert.deepEqual(cache.get(scope, "who signs off wires above the limit", anyone), { hit: true, answer, similarity: 1 });
});

test("the cache stores a hash of the question, never its text", () => {
  const { cache } = setup();
  cache.set(scope, "Can I fly business class to Zurich?", answer);
  const stored = cache.entriesFor(scope);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].questionHash, hashQuestion("can i fly business class to zurich"));
  assert.doesNotMatch(JSON.stringify(stored), /zurich/i);
});

test("entries expire after the TTL and are removed", () => {
  const { cache, tick } = setup();
  cache.set(scope, "Can I fly business class?", answer);
  tick(3_600_000);
  assert.deepEqual(cache.get(scope, "Can I fly business class?", anyone), { hit: false, reason: "expired" });
  assert.deepEqual(cache.get(scope, "Can I fly business class?", anyone), { hit: false, reason: "miss" });
});

test("a newer or deleted source version makes the cached answer stale", () => {
  const { cache, versions } = setup();
  cache.set(scope, "Can I fly business class?", answer);
  versions.set("travel-policy", 5);
  assert.deepEqual(cache.get(scope, "Can I fly business class?", anyone), { hit: false, reason: "stale" });
  versions.delete("travel-policy");
  cache.set(scope, "Can I fly business class?", answer);
  assert.deepEqual(cache.get(scope, "Can I fly business class?", anyone), { hit: false, reason: "stale" });
});

test("invalidating a document removes every answer that cited it, in every scope", () => {
  const { cache } = setup();
  cache.set(scope, "Can I fly business class?", answer);
  cache.set({ ...scope, tenantId: "southbank" }, "Can I fly business class?", answer);
  cache.set(scope, "Do expenses need receipts?", { text: "Yes [S1].", sources: [{ id: "expenses-policy", version: 2 }] });
  assert.equal(cache.invalidateDocument("travel-policy"), 2);
  assert.deepEqual(cache.get(scope, "Can I fly business class?", anyone), { hit: false, reason: "miss" });
  assert.equal(cache.get(scope, "Do expenses need receipts?", anyone).hit, true);
});

test("personalised, ungrounded and PII-bearing answers are never stored", () => {
  const { cache } = setup();
  assert.deepEqual(cache.set(scope, "What is my FX limit?", answer, { personalised: true }), { stored: false, reason: "personalised" });
  assert.deepEqual(cache.set(scope, "Unknown?", { text: "I do not know.", sources: [] }), { stored: false, reason: "ungrounded" });
  assert.deepEqual(
    cache.set(scope, "Refund?", { text: "Refund sent to [IBAN_1] [S1].", sources: [{ id: "travel-policy", version: 4 }] }),
    { stored: false, reason: "contains-pii" },
  );
  assert.deepEqual(cache.set(scope, "Customer jane.doe@example.com asks about fees", answer), { stored: false, reason: "contains-pii" });
  assert.deepEqual(
    cache.set(scope, "Refund?", { text: "Refunded to GB82 WEST 1234 5698 7654 32 [S1].", sources: [{ id: "travel-policy", version: 4 }] }),
    { stored: false, reason: "contains-pii" },
  );
  assert.deepEqual(cache.get(scope, "What is my FX limit?", anyone), { hit: false, reason: "miss" });
  assert.equal(containsPii("card 4111 1111 1111 1111"), true);
  assert.equal(containsPii("Business class over 6 hours, from 2026-01-01"), false);
});
