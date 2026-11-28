import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { DOCUMENTS, QUESTIONS } from "./documents.ts";
import { compareChunkers, fixedChunks, sentenceChunks, sentences, structureChunks, type Chunk } from "./index.ts";

const texts = (chunks: Chunk[]) => chunks.map((c) => c.text);
const offsetsMatch = (body: string, chunks: Chunk[]) => chunks.every((c) => c.text.endsWith(body.slice(c.start, c.end)));
const overdrafts = DOCUMENTS[0].body;

describe("fixed-size chunks", () => {
  test("windows of size characters, stepping by size minus overlap, covering the whole body", () => {
    assert.deepEqual(texts(fixedChunks("abcdefghij", 4)), ["abcd", "efgh", "ij"]);
    assert.deepEqual(texts(fixedChunks("abcdefghij", 4, 2)), ["abcd", "cdef", "efgh", "ghij"]);
    assert.deepEqual(fixedChunks("abcdefghij", 4, 2).map((c) => [c.start, c.end]), [[0, 4], [2, 6], [4, 8], [6, 10]]);
    assert.deepEqual(fixedChunks("", 4), []);
    assert.deepEqual(texts(fixedChunks("abc", 10)), ["abc"]);
  });

  test("overlap must be smaller than the chunk", () => {
    assert.throws(() => fixedChunks("abc", 4, 4), RangeError);
    assert.throws(() => fixedChunks("abc", 0), RangeError);
    assert.throws(() => fixedChunks("abc", 4, -1), RangeError);
  });
});

describe("sentence-aware chunks", () => {
  test("whole sentences are packed up to the limit and never cut", () => {
    const body = "One two. Three four five! Six? Seven eight nine ten.";
    assert.deepEqual(sentences(body).map((s) => body.slice(s.start, s.end)), ["One two.", "Three four five!", "Six?", "Seven eight nine ten."]);
    assert.deepEqual(texts(sentenceChunks(body, 30)), ["One two. Three four five! Six?", "Seven eight nine ten."]);
    for (const chunk of sentenceChunks(overdrafts, 200)) assert.ok(chunk.text.length <= 200);
    assert.ok(offsetsMatch(overdrafts, sentenceChunks(overdrafts, 200)));
  });

  test("overlap repeats the last sentences, but never past the limit", () => {
    const body = "Aaaa aaaa. Bbbb bbbb. Cccc cccc. Dddd dddd.";
    assert.deepEqual(texts(sentenceChunks(body, 21, 1)), ["Aaaa aaaa. Bbbb bbbb.", "Bbbb bbbb. Cccc cccc.", "Cccc cccc. Dddd dddd."]);
    assert.deepEqual(texts(sentenceChunks(body, 12, 1)), ["Aaaa aaaa.", "Bbbb bbbb.", "Cccc cccc.", "Dddd dddd."]);
  });

  test("a sentence longer than the limit falls back to fixed windows", () => {
    assert.deepEqual(texts(sentenceChunks("Short. " + "x".repeat(25) + ".", 10)), ["Short.", "xxxxxxxxxx", "xxxxxxxxxx", "xxxxx."]);
    assert.throws(() => sentenceChunks("a", 0), RangeError);
    assert.throws(() => sentenceChunks("a", 5, -1), RangeError);
  });
});

describe("structure-aware chunks", () => {
  test("one chunk per section when it fits, prefixed with its heading path", () => {
    const chunks = structureChunks(overdrafts, 500);
    assert.deepEqual(chunks.map((c) => c.headings), [
      ["Overdrafts explained"],
      ["Overdrafts explained", "How much an arranged overdraft costs"],
      ["Overdrafts explained", "Going past your limit"],
      ["Overdrafts explained", "Changing your limit"],
    ]);
    assert.ok(chunks[2].text.startsWith("Overdrafts explained > Going past your limit\nThere is no fee for an unarranged overdraft."));
    assert.ok(offsetsMatch(overdrafts, chunks), "offsets point at the section text in the body");
    assert.ok(chunks.every((c) => !overdrafts.slice(c.start, c.end).includes("##")), "headings are context, not content");
  });

  test("a section too long for the limit is sentence-chunked, each piece keeping the heading path", () => {
    const chunks = structureChunks(overdrafts, 150);
    const costs = chunks.filter((c) => c.headings?.at(-1) === "How much an arranged overdraft costs");
    assert.ok(costs.length > 1);
    for (const c of chunks) assert.ok(c.text.length <= 150, `${c.text.length} > 150`);
    for (const c of costs) assert.ok(c.text.startsWith("Overdrafts explained > How much an arranged overdraft costs\n"));
  });

  test("text before the first heading, nested levels and no headings at all", () => {
    const body = "Intro line.\n# A\nText a.\n## B\nText b.\n### C\nText c.\n## D\nText d.\n";
    assert.deepEqual(structureChunks(body, 100).map((c) => [c.headings, body.slice(c.start, c.end)]), [
      [[], "Intro line."],
      [["A"], "Text a."],
      [["A", "B"], "Text b."],
      [["A", "B", "C"], "Text c."],
      [["A", "D"], "Text d."],
    ]);
    assert.deepEqual(texts(structureChunks("Just text.", 100)), ["Just text."]);
  });
});

describe("comparing strategies on Northbank documents", () => {
  const results = () =>
    compareChunkers(DOCUMENTS, QUESTIONS, {
      fixed: (b) => fixedChunks(b, 300),
      "fixed+overlap": (b) => fixedChunks(b, 300, 75),
      sentence: (b) => sentenceChunks(b, 400),
      structure: (b) => structureChunks(b, 500),
    });
  const row = (name: string) => results().find((r) => r.strategy === name)!;

  test("fixed windows cut answers in half; overlap rescues them at a duplication cost", () => {
    assert.deepEqual(row("fixed"), { strategy: "fixed", chunks: 11, meanLength: 244, maxLength: 300, answersIntact: 0.75, duplication: 0 });
    assert.ok(row("fixed+overlap").answersIntact > row("fixed").answersIntact);
    assert.ok(row("fixed+overlap").duplication > 0.2);
  });

  test("structure-aware chunks keep every labelled answer whole with no duplication", () => {
    assert.equal(row("structure").answersIntact, 1);
    assert.equal(row("structure").duplication, 0);
    assert.ok(row("structure").maxLength <= 500);
    assert.ok(row("sentence").maxLength <= 400);
  });

  test("a label that is not in its document is an error, not a silent miss", () => {
    assert.throws(() => compareChunkers(DOCUMENTS, [{ ...QUESTIONS[0], answer: "not in the text" }], { fixed: (b) => fixedChunks(b, 300) }), /answer not found/);
    assert.throws(() => compareChunkers(DOCUMENTS, [{ ...QUESTIONS[0], sourceUri: "x" }], { fixed: (b) => fixedChunks(b, 300) }), /no document for x/);
  });
});
