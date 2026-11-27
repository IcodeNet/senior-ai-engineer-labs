import { test } from "vitest";
import assert from "node:assert/strict";
import { normaliseWeights, scoreOptions, sensitivity, type Criterion, type Option } from "./index.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

// Synthetic model-selection exercise; values are illustrative, not benchmarks or prices.
const criteria: Criterion[] = [
  { name: "quality", weight: 4, direction: "higher-is-better" },
  { name: "costPerMillion", weight: 3, direction: "lower-is-better" },
  { name: "latencyP95Ms", weight: 2, direction: "lower-is-better" },
  { name: "euResidency", weight: 0, direction: "higher-is-better", min: 1 },
  { name: "operability", weight: 1, direction: "higher-is-better" },
];
const options: Option[] = [
  { name: "hosted-large", values: { quality: 0.9, costPerMillion: 10, latencyP95Ms: 1800, euResidency: 1, operability: 0.9 } },
  { name: "hosted-small", values: { quality: 0.8, costPerMillion: 1, latencyP95Ms: 700, euResidency: 1, operability: 0.9 } },
  { name: "self-hosted-open", values: { quality: 0.84, costPerMillion: 4, latencyP95Ms: 1200, euResidency: 1, operability: 0.4 } },
  { name: "us-only-api", values: { quality: 0.95, costPerMillion: 3, latencyP95Ms: 900, euResidency: 0, operability: 0.8 } },
];

test("weights are normalised to sum to one", () => {
  const weights = normaliseWeights(criteria);
  close(weights.quality, 0.4);
  close(weights.costPerMillion, 0.3);
  close(weights.euResidency, 0);
  assert.throws(() => normaliseWeights([{ name: "x", weight: 0, direction: "higher-is-better" }]), RangeError);
  assert.throws(() => normaliseWeights([{ name: "x", weight: -1, direction: "higher-is-better" }]), RangeError);
});

test("hard constraints eliminate an option before scoring, however good it is", () => {
  const card = scoreOptions(options, criteria);
  assert.deepEqual(card.eliminated, [{ name: "us-only-api", criterion: "euResidency", reason: "below-min" }]);
  assert.equal(card.winner, "hosted-small");
  assert.deepEqual(card.ranking.map(r => r.name), ["hosted-small", "hosted-large", "self-hosted-open"]);
});

test("scores are weighted sums of min-max normalised values among eligible options", () => {
  const card = scoreOptions(options, criteria);
  const score = (name: string) => card.ranking.find(r => r.name === name)?.score ?? NaN;
  close(score("hosted-large"), 0.5);
  close(score("hosted-small"), 0.6);
  close(score("self-hosted-open"), 0.4 * 0.4 + 0.3 * (6 / 9) + 0.2 * (6 / 11));
});

test("ties on a criterion score 1 for everyone; max constraints and missing values are handled", () => {
  const tie = scoreOptions(options.slice(0, 2), [{ name: "operability", weight: 1, direction: "lower-is-better" }]);
  assert.deepEqual(tie.ranking, [{ name: "hosted-large", score: 1 }, { name: "hosted-small", score: 1 }]);
  const card = scoreOptions(options, criteria.map(c => (c.name === "costPerMillion" ? { ...c, max: 5 } : c)));
  assert.deepEqual(card.eliminated.map(e => [e.name, e.reason]), [["hosted-large", "above-max"], ["us-only-api", "below-min"]]);
  assert.throws(() => scoreOptions([{ name: "partial", values: { quality: 1 } }], criteria), {
    message: "option partial has no value for costPerMillion",
  });
  const none = scoreOptions([options[3]], criteria);
  assert.equal(none.winner, null);
  assert.deepEqual(none.ranking, []);
});

test("sensitivity analysis shows which weight change would flip the decision", () => {
  assert.deepEqual(sensitivity(options, criteria), { baseWinner: "hosted-small", robust: true, flips: [] });
  assert.deepEqual(sensitivity(options, criteria, 0.3), {
    baseWinner: "hosted-small",
    robust: false,
    flips: [{ criterion: "quality", direction: "increase", winner: "hosted-large" }],
  });
  assert.throws(() => sensitivity(options, criteria, 1), RangeError);
});
