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

export function exactAgreement(human: number[], judge: number[]): number {
  // TODO: share of identical scores.
  throw new Error("Not implemented: exactAgreement");
}

export function withinOne(human: number[], judge: number[]): number {
  // TODO: share of scores at most one apart.
  throw new Error("Not implemented: withinOne");
}

export function cohensKappa(human: number[], judge: number[]): number {
  // TODO: (observed - expected) / (1 - expected).
  throw new Error("Not implemented: cohensKappa");
}

export function falsePassRate(human: number[], judge: number[], passThreshold: number): number {
  // TODO: of the answers humans failed, the share the judge passed.
  throw new Error("Not implemented: falsePassRate");
}

export function calibrate(human: number[], judge: number[], options: CalibrationOptions = {}): Calibration {
  // TODO: combine the measures and decide whether the judge can be trusted.
  throw new Error("Not implemented: calibrate");
}
