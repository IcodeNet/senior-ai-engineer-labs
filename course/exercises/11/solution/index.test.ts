import { test } from "vitest";
import assert from "node:assert/strict";
import { assessGroundedness, contentTerms, splitSentences } from "./index.ts";

const sources = [
  { label: "S1", text: "Economy class is required for flights under six hours." },
  { label: "S2", text: "Receipts are required for expenses above 25 GBP." },
];

test("sentences split on terminal punctuation", () => {
  assert.deepEqual(splitSentences(" Economy only [S1]. Receipts?  Yes!  "), ["Economy only [S1].", "Receipts?", "Yes!"]);
  assert.deepEqual(splitSentences("   "), []);
});

test("content terms drop markers and stopwords but keep numbers", () => {
  assert.deepEqual(contentTerms("Receipts are needed above 25 GBP for you [S2]."), ["receipts", "needed", "above", "25", "gbp"]);
});

test("a supported, cited answer passes every check", () => {
  const result = assessGroundedness("Flights under six hours must be economy class [S1]. Receipts are needed above 25 GBP [S2].", sources);
  assert.deepEqual(
    result.sentences.map((s) => [s.supported, s.reason, s.citations]),
    [
      [true, undefined, ["S1"]],
      [true, undefined, ["S2"]],
    ],
  );
  assert.equal(result.citationCoverage, 1);
  assert.equal(result.supportedRate, 1);
});

test("each failure mode is reported with its reason", () => {
  const result = assessGroundedness(
    [
      "Managers approve all upgrades.",
      "Hotels are capped [S9].",
      "Receipts are required above 100 GBP [S2].",
      "Expenses need receipts [S1].",
      "Economy class applies [S1] [S1].",
    ].join(" "),
    sources,
  );
  assert.deepEqual(
    result.sentences.map((s) => s.reason),
    ["uncited", "unknown-source", "unsupported-number", "low-overlap", undefined],
  );
  assert.deepEqual(result.sentences[4].citations, ["S1"]);
  assert.equal(result.citationCoverage, 4 / 5);
  assert.equal(result.supportedRate, 1 / 5);
});

test("overlap threshold is configurable and empty answers score zero", () => {
  const sentence = "Expenses above 25 GBP need manager sign-off [S2].";
  assert.equal(assessGroundedness(sentence, sources, 0.6).sentences[0].reason, "low-overlap");
  assert.equal(assessGroundedness(sentence, sources, 0.5).sentences[0].supported, true);
  assert.deepEqual(assessGroundedness("", sources), { sentences: [], citationCoverage: 0, supportedRate: 0 });
});
