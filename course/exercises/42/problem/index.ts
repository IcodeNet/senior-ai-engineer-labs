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

export function evaluateSlo(events: RequestEvent[], slo: SloDefinition, atRiskBelow = 0.25): SloReport {
  // TODO: eligible and good events per SLO kind, error budget, remaining budget and status.
  throw new Error("Not implemented: evaluateSlo");
}

export function burnRate(window: Window, target: number): number {
  // TODO: bad fraction divided by the budgeted fraction (1 - target).
  throw new Error("Not implemented: burnRate");
}

export function shouldPage(windows: { short: Window; long: Window }, target: number, threshold = 14.4): boolean {
  // TODO: both windows at or above the burn-rate threshold.
  throw new Error("Not implemented: shouldPage");
}
