export interface CalibrationOptions {
  passThreshold?: number;
  minKappa?: number;
  maxFalsePass?: number;
}

export interface Calibration {
  n: number;
  exact: number;
  withinOne: number;
  kappa: number;
  falsePass: number;
  trusted: boolean;
}

function check(human: number[], judge: number[]): void {
  if (human.length === 0 || human.length !== judge.length) throw new RangeError("need two non-empty arrays of equal length");
}

export function exactAgreement(human: number[], judge: number[]): number {
  check(human, judge);
  return human.filter((score, i) => score === judge[i]).length / human.length;
}

export function withinOne(human: number[], judge: number[]): number {
  check(human, judge);
  return human.filter((score, i) => Math.abs(score - judge[i]) <= 1).length / human.length;
}

export function cohensKappa(human: number[], judge: number[]): number {
  const observed = exactAgreement(human, judge);
  const n = human.length;
  const share = (scores: number[], value: number) => scores.filter((s) => s === value).length / n;
  const expected = [...new Set([...human, ...judge])].reduce((sum, value) => sum + share(human, value) * share(judge, value), 0);
  if (expected === 1) return observed === 1 ? 1 : 0;
  return (observed - expected) / (1 - expected);
}

export function falsePassRate(human: number[], judge: number[], passThreshold: number): number {
  check(human, judge);
  const failed = human.map((score, i) => ({ score, judged: judge[i] })).filter((pair) => pair.score < passThreshold);
  return failed.length === 0 ? 0 : failed.filter((pair) => pair.judged >= passThreshold).length / failed.length;
}

export function calibrate(human: number[], judge: number[], options: CalibrationOptions = {}): Calibration {
  const { passThreshold = 4, minKappa = 0.6, maxFalsePass = 0.1 } = options;
  const kappa = cohensKappa(human, judge);
  const falsePass = falsePassRate(human, judge, passThreshold);
  return {
    n: human.length,
    exact: exactAgreement(human, judge),
    withinOne: withinOne(human, judge),
    kappa,
    falsePass,
    trusted: kappa >= minKappa && falsePass <= maxFalsePass,
  };
}
