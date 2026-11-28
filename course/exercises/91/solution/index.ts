export interface RequestEvent {
  /** The request returned an answer (no 5xx, timeout or content-filter failure). */
  ok: boolean;
  latencyMs: number;
  /** Result of the sampled quality evaluation (for example groundedness); absent when not evaluated. */
  quality?: "pass" | "fail";
}

export type SloDefinition =
  | { name: string; kind: "availability"; target: number }
  | { name: string; kind: "latency"; target: number; thresholdMs: number }
  | { name: string; kind: "quality"; target: number; minSamples: number };

export type SloStatus = "ok" | "at-risk" | "breached" | "insufficient-data";

export interface SloReport {
  name: string;
  good: number;
  total: number;
  bad: number;
  compliance: number | null;
  allowedBad: number;
  budgetRemaining: number;
  status: SloStatus;
}

export interface Window {
  bad: number;
  total: number;
}

function assertTarget(target: number): void {
  if (!(target > 0 && target < 1)) throw new RangeError("target must be strictly between 0 and 1");
}

function eligible(events: RequestEvent[], slo: SloDefinition): { good: number; total: number } {
  switch (slo.kind) {
    case "availability":
      return { good: events.filter(e => e.ok).length, total: events.length };
    case "latency": {
      // Failed requests are counted by availability, not latency.
      const served = events.filter(e => e.ok);
      return { good: served.filter(e => e.latencyMs <= slo.thresholdMs).length, total: served.length };
    }
    case "quality": {
      const evaluated = events.filter(e => e.ok && e.quality !== undefined);
      return { good: evaluated.filter(e => e.quality === "pass").length, total: evaluated.length };
    }
  }
}

export function evaluateSlo(events: RequestEvent[], slo: SloDefinition, atRiskBelow = 0.25): SloReport {
  assertTarget(slo.target);
  const { good, total } = eligible(events, slo);
  const bad = total - good;
  const allowedBad = (1 - slo.target) * total;
  const budgetRemaining = allowedBad === 0 ? 1 : 1 - bad / allowedBad;
  let status: SloStatus;
  if (total === 0 || (slo.kind === "quality" && total < slo.minSamples)) status = "insufficient-data";
  else if (bad > allowedBad) status = "breached";
  else if (budgetRemaining < atRiskBelow) status = "at-risk";
  else status = "ok";
  return { name: slo.name, good, total, bad, compliance: total === 0 ? null : good / total, allowedBad, budgetRemaining, status };
}

export function burnRate(window: Window, target: number): number {
  assertTarget(target);
  if (window.total === 0) return 0;
  return window.bad / window.total / (1 - target);
}

export function shouldPage(windows: { short: Window; long: Window }, target: number, threshold = 14.4): boolean {
  return burnRate(windows.short, target) >= threshold && burnRate(windows.long, target) >= threshold;
}
