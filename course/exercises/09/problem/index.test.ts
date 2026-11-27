import { test } from "vitest";
import assert from "node:assert/strict";
import { assignSplit, normaliseQuery, splitDataset, validateDataset, type EvalCase } from "./index.ts";

const corpus = new Set(["travel#0", "travel#1", "gifts#0"]);
const good: EvalCase[] = [
  { id: "q1", query: "Can I fly business class?", relevant: { "travel#0": 3, "travel#1": 1 } },
  { id: "q2", query: "What gifts must be registered?", relevant: { "gifts#0": 3 } },
];

test("a clean dataset has no problems", () => {
  assert.deepEqual(validateDataset(good, corpus), []);
});

test("queries are normalised before comparison", () => {
  assert.equal(normaliseQuery("  Can I fly   BUSINESS-class?! "), "can i fly business class");
});

test("every kind of problem is reported in order", () => {
  const cases: EvalCase[] = [
    ...good,
    { id: "q1", query: "duplicate id", relevant: { "gifts#0": 1 } },
    { id: "q3", query: "   ", relevant: {} },
    { id: "q4", query: "Hotel limits?", relevant: { "travel#0": 0, "hotels#9": 2, "gifts#0": 2.5 } },
    { id: "q5", query: "can I fly business-class", relevant: { "travel#0": 3 } },
  ];
  assert.deepEqual(validateDataset(cases, corpus), [
    "duplicate id: q1",
    "q3: empty query",
    "q3: no relevant chunks",
    "q4: grade for travel#0 must be an integer from 1 to 3",
    "q4: grade for gifts#0 must be an integer from 1 to 3",
    "q4: unknown chunk hotels#9",
    "q5: same query as q1",
  ]);
});

test("splits are deterministic and independent of order", () => {
  const ids = Array.from({ length: 1000 }, (_, i) => `case-${i}`);
  const first = ids.map((id) => assignSplit(id, 0.3));
  const again = [...ids].reverse().map((id) => assignSplit(id, 0.3)).reverse();
  assert.deepEqual(again, first);
  const share = first.filter((split) => split === "test").length / ids.length;
  assert.ok(share > 0.25 && share < 0.35, `test share ${share} should be close to 0.3`);
  assert.ok(ids.every((id) => assignSplit(id, 0) === "dev"));
  assert.ok(ids.every((id) => assignSplit(id, 1) === "test"));
  assert.throws(() => assignSplit("x", 1.5), RangeError);
  assert.throws(() => assignSplit("x", Number.NaN), RangeError);
});

test("splitDataset partitions every case exactly once, preserving order", () => {
  const cases = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, query: `q${i}`, relevant: { "gifts#0": 1 } }));
  const { dev, test: held } = splitDataset(cases, 0.5);
  assert.equal(dev.length + held.length, 50);
  assert.ok(dev.length > 0 && held.length > 0);
  assert.deepEqual([...dev, ...held].map((c) => c.id).sort(), cases.map((c) => c.id).sort());
  assert.deepEqual(dev.map((c) => c.id), cases.filter((c) => dev.includes(c)).map((c) => c.id));
  assert.ok(held.every((c) => assignSplit(c.id, 0.5) === "test"));
});
