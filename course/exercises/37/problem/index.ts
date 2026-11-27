export type Variant = "baseline" | "canary";

export interface Outcome {
  kind: "answer" | "abstain";
  citations: string[];
}

export interface ShadowPair {
  requestId: string;
  baseline: Outcome;
  candidate: Outcome;
}

export interface ShadowReport {
  agreement: number;
  disagreements: { requestId: string; kind: "abstain-mismatch" | "citation-mismatch" }[];
}

export interface ReleaseMetrics {
  requests: number;
  errors: number;
  p95Ms: number;
  groundedness: number;
  costPerQuery: number;
  safetyViolations: number;
}

export interface RolloutPolicy {
  minRequests: number;
  /** Absolute increase in error rate allowed, e.g. 0.01 = one percentage point. */
  maxErrorRateIncrease: number;
  /** Relative increases allowed, e.g. 0.2 = 20%. */
  maxLatencyIncrease: number;
  maxCostIncrease: number;
  /** Absolute drop in groundedness allowed. */
  maxGroundednessDrop: number;
}

export type Action = "promote" | "hold" | "rollback";

export interface RolloutDecision {
  action: Action;
  reasons: string[];
}

export const ROLLOUT_STAGES = [0, 1, 5, 25, 50, 100];

/** FNV-1a 32-bit hash of the key, reduced to a bucket from 0 to 99. */
export function bucketOf(key: string): number {
  // TODO: FNV-1a 32-bit (offset 0x811c9dc5, prime 0x01000193, Math.imul and >>> 0) modulo 100.
  throw new Error("Not implemented: bucketOf");
}

export function assignVariant(userId: string, canaryPercent: number, salt = "release"): Variant {
  // TODO: canary when bucketOf('<salt>:<userId>') is below canaryPercent; RangeError outside 0-100.
  throw new Error("Not implemented: assignVariant");
}

export function shadowAgreement(pairs: ShadowPair[]): ShadowReport {
  // TODO: disagree on different kinds, or on different citation sets for two answers; report the agreement rate.
  throw new Error("Not implemented: shadowAgreement");
}

export function rolloutDecision(baseline: ReleaseMetrics, canary: ReleaseMetrics, policy: RolloutPolicy): RolloutDecision {
  // TODO: safety first, then traffic, then every breached guardrail; otherwise promote.
  throw new Error("Not implemented: rolloutDecision");
}

export function nextCanaryPercent(current: number, action: Action): number {
  // TODO: next ROLLOUT_STAGES entry on promote, same on hold, 0 on rollback; RangeError for unknown stages.
  throw new Error("Not implemented: nextCanaryPercent");
}
