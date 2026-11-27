import { test } from "vitest";
import assert from "node:assert/strict";
import { chunkDocument, tokenize, type SourceDocument } from "./index.ts";

const doc = (text: string): SourceDocument => ({
  id: "policy-7",
  title: "Expense policy",
  text,
  status: "approved",
  version: 3,
  effectiveDate: "2026-01-01",
});

test("tokenize splits on any whitespace without empty tokens", () => {
  assert.deepEqual(tokenize("  claims\tover\n500  GBP "), ["claims", "over", "500", "GBP"]);
  assert.deepEqual(tokenize("   "), []);
});

test("windows overlap and stop at the end of the document", () => {
  const chunks = chunkDocument(doc("w0 w1 w2 w3 w4 w5 w6 w7 w8 w9"), { size: 4, overlap: 2 });
  assert.deepEqual(
    chunks.map((c) => c.text),
    ["w0 w1 w2 w3", "w2 w3 w4 w5", "w4 w5 w6 w7", "w6 w7 w8 w9"],
  );
});

test("a short final window is kept when it adds new words", () => {
  const chunks = chunkDocument(doc("a b c d e f g"), { size: 3, overlap: 0 });
  assert.deepEqual(chunks.map((c) => c.text), ["a b c", "d e f", "g"]);
});

test("every chunk carries id, index and governance metadata", () => {
  const chunks = chunkDocument(doc("one two three four five"), { size: 3, overlap: 1 });
  assert.equal(chunks.length, 2);
  chunks.forEach((chunk, index) => {
    assert.equal(chunk.id, `policy-7#${index}`);
    assert.equal(chunk.chunkIndex, index);
    assert.equal(chunk.docId, "policy-7");
    assert.equal(chunk.title, "Expense policy");
    assert.equal(chunk.status, "approved");
    assert.equal(chunk.version, 3);
    assert.equal(chunk.effectiveDate, "2026-01-01");
  });
});

test("an empty document produces no chunks", () => {
  assert.deepEqual(chunkDocument(doc(" \n "), { size: 5, overlap: 1 }), []);
});

test("invalid size or overlap is rejected", () => {
  for (const options of [
    { size: 0, overlap: 0 },
    { size: 2.5, overlap: 0 },
    { size: 4, overlap: 4 },
    { size: 4, overlap: -1 },
  ])
    assert.throws(() => chunkDocument(doc("a b c"), options), RangeError);
});
