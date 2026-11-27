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
  before: number;
  after: number;
}

function assertRating(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 10) throw new RangeError(`${name} must be an integer from 1 to 10`);
}

export function rpn(mode: FailureMode): number {
  assertRating("severity", mode.severity);
  assertRating("occurrence", mode.occurrence);
  assertRating("detection", mode.detection);
  return mode.severity * mode.occurrence * mode.detection;
}

export function prioritise(modes: FailureMode[], options: { rpnThreshold?: number; severityThreshold?: number } = {}): Priority[] {
  const { rpnThreshold = 100, severityThreshold = 9 } = options;
  return modes
    .map(mode => {
      const score = rpn(mode);
      const byRpn = score >= rpnThreshold;
      const bySeverity = mode.severity >= severityThreshold;
      const trigger: Trigger = byRpn && bySeverity ? "both" : byRpn ? "rpn" : bySeverity ? "severity" : "none";
      return { id: mode.id, rpn: score, severity: mode.severity, actionRequired: trigger !== "none", trigger };
    })
    .sort((a, b) => b.rpn - a.rpn || b.severity - a.severity || a.id.localeCompare(b.id));
}

export function applyMitigations(modes: FailureMode[], mitigations: Mitigation[]): ResidualRisk {
  const updated = new Map(modes.map(mode => [mode.id, { ...mode }]));
  for (const mitigation of mitigations) {
    const mode = updated.get(mitigation.modeId);
    if (!mode) throw new Error(`unknown failure mode ${mitigation.modeId}`);
    for (const field of ["occurrence", "detection"] as const) {
      const value = mitigation[field];
      if (value === undefined) continue;
      assertRating(field, value);
      if (value > mode[field]) throw new RangeError(`${mitigation.control} would raise ${field} of ${mode.id}`);
      mode[field] = value;
    }
  }
  const after = [...updated.values()];
  const total = (list: FailureMode[]) => list.reduce((sum, mode) => sum + rpn(mode), 0);
  return { modes: after, before: total(modes), after: total(after) };
}
