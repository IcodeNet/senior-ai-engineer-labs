import { test } from "vitest";
import assert from "node:assert/strict";
import { calibrate, cohensKappa, exactAgreement, falsePassRate, withinOne } from "./index.ts";

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("exact and within-one agreement", () => {
  close(exactAgreement([5, 4, 3, 1], [5, 3, 3, 4]), 2 / 4);
  close(withinOne([5, 4, 3, 1], [5, 3, 3, 4]), 3 / 4);
  assert.throws(() => exactAgreement([], []), RangeError);
  assert.throws(() => withinOne([1, 2], [1]), RangeError);
});

test("kappa corrects agreement for chance", () => {
  close(cohensKappa([1, 1, 0, 0], [1, 0, 0, 0]), 0.5);
  close(cohensKappa([5, 4, 3, 2, 1], [5, 4, 3, 2, 1]), 1);
  close(cohensKappa([5, 5], [5, 5]), 1);
  assert.equal(cohensKappa([5, 5], [4, 4]), 0);
});

test("a judge that always says 5 agrees often but has no skill", () => {
  const human = [5, 5, 5, 5, 5, 5, 5, 5, 2, 1];
  const lenient = human.map(() => 5);
  close(exactAgreement(human, lenient), 0.8);
  close(cohensKappa(human, lenient), 0);
  close(falsePassRate(human, lenient, 4), 1);
});

test("false-pass rate only looks at answers humans failed", () => {
  close(falsePassRate([5, 2, 1, 3], [5, 4, 1, 2], 4), 1 / 3);
  assert.equal(falsePassRate([5, 4], [1, 1], 4), 0);
});

test("calibration combines the measures into a trust decision", () => {
  const human = [5, 5, 4, 4, 3, 2, 1, 5, 2, 4];
  const good = [5, 5, 4, 4, 3, 2, 1, 4, 2, 4];
  const report = calibrate(human, good);
  assert.equal(report.n, 10);
  close(report.exact, 0.9);
  close(report.withinOne, 1);
  assert.ok(report.kappa > 0.8);
  assert.equal(report.falsePass, 0);
  assert.equal(report.trusted, true);
  const leaky = [5, 5, 4, 4, 4, 2, 1, 5, 2, 4];
  const leakyReport = calibrate(human, leaky);
  close(leakyReport.falsePass, 1 / 4);
  assert.equal(leakyReport.trusted, false);
  assert.equal(calibrate(human, leaky, { maxFalsePass: 0.3 }).trusted, leakyReport.kappa >= 0.6);
});
