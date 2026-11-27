export interface FailureMode {
  id: string;
  stage: string;
  description: string;
  /** 1 (negligible) to 10 (regulatory breach or harm). */
  severity: number;
  /** 1 (very unlikely) to 10 (almost certain). */
  occurrence: number;
  /** 1 (always caught before users see it) to 10 (cannot be detected). */
  detection: number;
}

export type Trigger = "rpn" | "severity" | "both" | "none";

export interface Priority {
  id: string;
  rpn: number;
  severity: number;
  actionRequired: boolean;
  trigger: Trigger;
}

/** A control lowers how often a failure happens or improves how reliably it is caught. Severity changes need a redesign. */
export interface Mitigation {
  modeId: string;
  control: string;
  occurrence?: number;
  detection?: number;
}

export interface ResidualRisk {
  modes: FailureMode[];
  /** Summed RPN before and after: a progress indicator only; ratings are ordinal, so the totals are not a risk measure. */
  before: number;
  after: number;
}

export function rpn(mode: FailureMode): number {
  // TODO: validate the 1-10 ratings and multiply them.
  throw new Error("Not implemented: rpn");
}

export function prioritise(modes: FailureMode[], options: { rpnThreshold?: number; severityThreshold?: number } = {}): Priority[] {
  // TODO: RPN, trigger and action flag per mode, highest risk first.
  throw new Error("Not implemented: prioritise");
}

export function applyMitigations(modes: FailureMode[], mitigations: Mitigation[]): ResidualRisk {
  // TODO: apply mitigations to copies, then total RPN before and after.
  throw new Error("Not implemented: applyMitigations");
}
