import { test } from "vitest";
import assert from "node:assert/strict";
import { cosine, normalizeQuestion, scopeKey, SemanticCache, type CacheScope, type Embed } from "./index.ts";

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

const scope: CacheScope = { tenantId: "northbank", groups: ["travel-desk", "all-staff"], model: "chat-v1", promptVersion: "p3" };
const answer = { text: "Business class is allowed on flights over 6 hours [S1].", sources: [{ id: "travel-policy", version: 4 }] };

function setup(start = 0) {
  let clock = start;
  const versions = new Map([["travel-policy", 4], ["expenses-policy", 2]]);
  const cache = new SemanticCache({ embed, threshold: 0.9, ttlMs: 3_600_000, now: () => clock, currentVersion: (id) => versions.get(id) });
  return { cache, versions, tick: (ms: number) => (clock += ms) };
}

test("questions are normalised and scope keys ignore group order", () => {
  assert.equal(normalizeQuestion("  Can I fly   BUSINESS class?? "), "can i fly business class");
  assert.equal(scopeKey(scope), "northbank|all-staff,travel-desk|chat-v1|p3");
  assert.equal(scopeKey({ ...scope, groups: ["all-staff", "travel-desk"] }), scopeKey(scope));
  assert.equal(cosine([1, 0], [0, 0]), 0);
  assert.throws(() => cosine([1], [1, 2]), RangeError);
});

test("a paraphrase in the same scope is a hit; an unrelated question is a miss", () => {
  const { cache } = setup();
  assert.deepEqual(cache.set(scope, "Can I fly business class on long flights?", answer), { stored: true });
  const hit = cache.get(scope, "Is business class allowed when flying?");
  assert.equal(hit.hit, true);
  assert.ok(hit.hit && hit.similarity >= 0.9 && hit.answer === answer);
  assert.deepEqual(cache.get(scope, "Do expenses need receipts?"), { hit: false, reason: "miss" });
  assert.deepEqual(cache.get(scope, "  CAN I FLY BUSINESS CLASS ON LONG FLIGHTS "), { hit: true, answer, similarity: 1 });
});

test("answers never cross tenant, permission, model or prompt-version boundaries", () => {
  const { cache } = setup();
  cache.set(scope, "Can I fly business class?", answer);
  for (const other of [
    { ...scope, tenantId: "southbank" },
    { ...scope, groups: ["all-staff"] },
    { ...scope, model: "chat-v2" },
    { ...scope, promptVersion: "p4" },
  ])
    assert.deepEqual(cache.get(other, "Can I fly business class?"), { hit: false, reason: "miss" });
});

test("entries expire after the TTL and are removed", () => {
  const { cache, tick } = setup();
  cache.set(scope, "Can I fly business class?", answer);
  tick(3_600_000);
  assert.deepEqual(cache.get(scope, "Can I fly business class?"), { hit: false, reason: "expired" });
  assert.deepEqual(cache.get(scope, "Can I fly business class?"), { hit: false, reason: "miss" });
});

test("a newer or deleted source version makes the cached answer stale", () => {
  const { cache, versions } = setup();
  cache.set(scope, "Can I fly business class?", answer);
  versions.set("travel-policy", 5);
  assert.deepEqual(cache.get(scope, "Can I fly business class?"), { hit: false, reason: "stale" });
  versions.delete("travel-policy");
  cache.set(scope, "Can I fly business class?", answer);
  assert.deepEqual(cache.get(scope, "Can I fly business class?"), { hit: false, reason: "stale" });
});

test("invalidating a document removes every answer that cited it, in every scope", () => {
  const { cache } = setup();
  cache.set(scope, "Can I fly business class?", answer);
  cache.set({ ...scope, tenantId: "southbank" }, "Can I fly business class?", answer);
  cache.set(scope, "Do expenses need receipts?", { text: "Yes [S1].", sources: [{ id: "expenses-policy", version: 2 }] });
  assert.equal(cache.invalidateDocument("travel-policy"), 2);
  assert.deepEqual(cache.get(scope, "Can I fly business class?"), { hit: false, reason: "miss" });
  assert.equal(cache.get(scope, "Do expenses need receipts?").hit, true);
});

test("personalised, ungrounded and PII-bearing answers are never stored", () => {
  const { cache } = setup();
  assert.deepEqual(cache.set(scope, "What is my FX limit?", answer, { personalised: true }), { stored: false, reason: "personalised" });
  assert.deepEqual(cache.set(scope, "Unknown?", { text: "I do not know.", sources: [] }), { stored: false, reason: "ungrounded" });
  assert.deepEqual(
    cache.set(scope, "Refund?", { text: "Refund sent to [IBAN_1] [S1].", sources: [{ id: "travel-policy", version: 4 }] }),
    { stored: false, reason: "contains-pii" },
  );
  assert.deepEqual(cache.get(scope, "What is my FX limit?"), { hit: false, reason: "miss" });
});
