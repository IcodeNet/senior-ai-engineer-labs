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
  // TODO: search = units × hours × searchUnitHour; tokens = per-million input and output prices; round each to the cent; reject negative or non-finite plan values.
  throw new Error("Not implemented: estimate");
}

/** Hours a dedicated service can exist before its search cost alone passes the budget. */
export function hoursWithinBudget(budget: number, searchUnits: number, rates: Rates): number {
  // TODO: whole hours of search cost that fit in the budget.
  throw new Error("Not implemented: hoursWithinBudget");
}

/** "Unknown" outranks "may exist", which outranks "exists": the banner shows the least certain state. */
export function bannerFor(files: string[]): Banner {
  // TODO: unknown outranks may-exist, which outranks exists; no marker means no banner.
  throw new Error("Not implemented: bannerFor");
}

/** Only a clean sweep of the recorded subscription may clear the banner. Anything else keeps it. */
export function canClearBanner(result: VerifyResult): boolean {
  // TODO: true only for an error-free sweep of the recorded subscription that found nothing at all.
  throw new Error("Not implemented: canClearBanner");
}

/** A typed confirmation must match exactly: no trimming of inner text, no case folding, one trailing newline allowed. */
export function confirmed(expected: string, typed: string): boolean {
  // TODO: exact match; allow one trailing newline; throw on an empty expected value.
  throw new Error("Not implemented: confirmed");
}
