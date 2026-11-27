import { test } from "vitest";
import assert from "node:assert/strict";
import { bm25Search, terms } from "./index.ts";

test("terms lower-cases and splits on punctuation", () => {
  assert.deepEqual(terms("Error ERR-4021: retry, then Escalate!"), ["error", "err", "4021", "retry", "then", "escalate"]);
});

test("a single matching document scores exactly idf when length equals the average", () => {
  const [hit] = bm25Search("refund", [{ id: "a", text: "refund" }]);
  assert.equal(hit.id, "a");
  assert.ok(Math.abs(hit.score - Math.log(4 / 3)) < 1e-12);
});

test("documents without any query term are not returned", () => {
  const results = bm25Search("pension", [
    { id: "a", text: "travel expenses" },
    { id: "b", text: "gift register" },
  ]);
  assert.deepEqual(results, []);
});

test("rare terms outweigh common ones", () => {
  const chunks = [
    { id: "common", text: "policy policy update" },
    { id: "rare", text: "policy sanctions update" },
    { id: "c", text: "policy holidays" },
    { id: "d", text: "policy pensions" },
  ];
  const [first] = bm25Search("policy sanctions", chunks);
  assert.equal(first.id, "rare");
});

test("shorter chunks rank above longer chunks with the same term frequency", () => {
  const results = bm25Search("bonus", [
    { id: "long", text: "bonus payments are reviewed annually by the remuneration committee each spring" },
    { id: "short", text: "bonus payments reviewed" },
  ]);
  assert.deepEqual(results.map((r) => r.id), ["short", "long"]);
});

test("term frequency saturates", () => {
  const chunks = [
    { id: "one", text: "audit x x x x x x x x x" },
    { id: "ten", text: "audit audit audit audit audit audit audit audit audit audit" },
    { id: "pad", text: "unrelated text here" },
  ];
  const results = bm25Search("audit", chunks, { b: 0 });
  const one = results.find((r) => r.id === "one")!.score;
  const ten = results.find((r) => r.id === "ten")!.score;
  assert.ok(ten > one);
  assert.ok(ten < one * 3, "ten mentions should not be worth ten times one");
});

test("matching is case-insensitive, query terms are de-duplicated and results are capped", () => {
  const chunks = Array.from({ length: 8 }, (_, i) => ({ id: `doc-${i}`, text: `Claims process step ${i}` }));
  const single = bm25Search("claims", chunks, { top: 3 });
  const repeated = bm25Search("CLAIMS claims Claims", chunks, { top: 3 });
  assert.equal(single.length, 3);
  assert.deepEqual(repeated, single);
  assert.deepEqual(single.map((r) => r.id), ["doc-0", "doc-1", "doc-2"], "ties break by id");
});
