/**
 * Rates are always supplied by the caller (in the course, `azure:plan` reads them from the public Azure Retail Prices API).
 * Nothing here hard-codes a price: prices change by region, currency, agreement and date.
 */
export interface Rates {
  currency: string;
  /** Price of one search unit for one hour on the chosen dedicated tier. */
  searchUnitHour: number;
  /** Price per million input and output tokens for the chat model. */
  inputPerMillion: number;
  outputPerMillion: number;
}

export interface Plan {
  /** Replicas × partitions. Basic with one replica and one partition is 1. */
  searchUnits: number;
  /** Hours between set-up and a verified shutdown. Billing runs while the service exists, used or not. */
  hours: number;
  inputTokens: number;
  outputTokens: number;
}

export interface Estimate {
  currency: string;
  search: number;
  tokens: number;
  total: number;
}

export type Marker = "env.json" | "resources-may-exist.json" | "cost-status-unknown.json";
export type Banner = { level: "none" } | { level: "danger"; reason: "unknown" | "may-exist" | "exists" };

export interface VerifyResult {
  /** The subscription the sweep covered, and the one recorded at set-up. */
  sweptSubscription: string | null;
  recordedSubscription: string | null;
  /** Course-tagged resource groups, resources and soft-deleted accounts found by the sweep. */
  groups: number;
  resources: number;
  softDeleted: number;
  /** True when any list call failed, for example because of a sign-in or permission error. */
  errors: boolean;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function estimate(plan: Plan, rates: Rates): Estimate {
  for (const [key, value] of Object.entries(plan))
    if (!Number.isFinite(value) || value < 0) throw new Error(`invalid plan: ${key} must be a non-negative number`);
  const search = plan.searchUnits * plan.hours * rates.searchUnitHour;
  const tokens = (plan.inputTokens * rates.inputPerMillion + plan.outputTokens * rates.outputPerMillion) / 1_000_000;
  return { currency: rates.currency, search: roundMoney(search), tokens: roundMoney(tokens), total: roundMoney(search + tokens) };
}

/** Hours a dedicated service can exist before its search cost alone passes the budget. */
export function hoursWithinBudget(budget: number, searchUnits: number, rates: Rates): number {
  if (searchUnits <= 0 || rates.searchUnitHour <= 0) throw new Error("searchUnits and searchUnitHour must be positive");
  return Math.floor(budget / (searchUnits * rates.searchUnitHour));
}

/** "Unknown" outranks "may exist", which outranks "exists": the banner shows the least certain state. */
export function bannerFor(files: string[]): Banner {
  if (files.includes("cost-status-unknown.json")) return { level: "danger", reason: "unknown" };
  if (files.includes("resources-may-exist.json")) return { level: "danger", reason: "may-exist" };
  if (files.includes("env.json")) return { level: "danger", reason: "exists" };
  return { level: "none" };
}

/** Only a clean sweep of the recorded subscription may clear the banner. Anything else keeps it. */
export function canClearBanner(result: VerifyResult): boolean {
  if (result.errors) return false;
  if (!result.sweptSubscription || !result.recordedSubscription) return false;
  if (result.sweptSubscription !== result.recordedSubscription) return false;
  return result.groups === 0 && result.resources === 0 && result.softDeleted === 0;
}

/** A typed confirmation must match exactly: no trimming of inner text, no case folding, one trailing newline allowed. */
export function confirmed(expected: string, typed: string): boolean {
  if (!expected) throw new Error("expected confirmation text is empty");
  return typed.replace(/\r?\n$/, "") === expected;
}
