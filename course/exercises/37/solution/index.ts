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
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

export function assignVariant(userId: string, canaryPercent: number, salt = "release"): Variant {
  if (canaryPercent < 0 || canaryPercent > 100) throw new RangeError("canaryPercent must be between 0 and 100");
  return bucketOf(`${salt}:${userId}`) < canaryPercent ? "canary" : "baseline";
}

export function shadowAgreement(pairs: ShadowPair[]): ShadowReport {
  if (pairs.length === 0) throw new RangeError("no shadow pairs");
  const disagreements: ShadowReport["disagreements"] = [];
  for (const { requestId, baseline, candidate } of pairs) {
    if (baseline.kind !== candidate.kind) disagreements.push({ requestId, kind: "abstain-mismatch" });
    else if (baseline.kind === "answer") {
      const a = [...new Set(baseline.citations)].sort().join("\n");
      const b = [...new Set(candidate.citations)].sort().join("\n");
      if (a !== b) disagreements.push({ requestId, kind: "citation-mismatch" });
    }
  }
  return { agreement: (pairs.length - disagreements.length) / pairs.length, disagreements };
}

export function rolloutDecision(baseline: ReleaseMetrics, canary: ReleaseMetrics, policy: RolloutPolicy): RolloutDecision {
  if (canary.safetyViolations > 0) return { action: "rollback", reasons: ["safety-violations"] };
  if (canary.requests < policy.minRequests) return { action: "hold", reasons: ["insufficient-traffic"] };
  const errorRate = (m: ReleaseMetrics) => (m.requests === 0 ? 0 : m.errors / m.requests);
  const reasons: string[] = [];
  if (errorRate(canary) - errorRate(baseline) > policy.maxErrorRateIncrease) reasons.push("error-rate");
  if (canary.p95Ms > baseline.p95Ms * (1 + policy.maxLatencyIncrease)) reasons.push("latency");
  if (baseline.groundedness - canary.groundedness > policy.maxGroundednessDrop) reasons.push("groundedness");
  if (canary.costPerQuery > baseline.costPerQuery * (1 + policy.maxCostIncrease)) reasons.push("cost");
  return reasons.length ? { action: "rollback", reasons } : { action: "promote", reasons: [] };
}

export function nextCanaryPercent(current: number, action: Action): number {
  const index = ROLLOUT_STAGES.indexOf(current);
  if (index === -1) throw new RangeError(`${current}% is not a rollout stage`);
  if (action === "rollback") return 0;
  if (action === "hold") return current;
  return ROLLOUT_STAGES[Math.min(index + 1, ROLLOUT_STAGES.length - 1)];
}
