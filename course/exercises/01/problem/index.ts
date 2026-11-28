export type Version = [number, number, number];

/** What the doctor observed on this machine. Collecting the facts is separated from judging them, so the judgement is testable. */
export interface Facts {
  /** `process.version`, for example "v22.13.0". */
  node: string;
  /** `npm --version`, or null when npm is not on the PATH. */
  npm: string | null;
  /** `git --version` output such as "git version 2.47.1", or null. */
  git: string | null;
  /** Commit of the engine checkout in `.icode/engine`, or null when setup has not run. */
  engineCommit: string | null;
  /** Commit pinned in `icode/engine.json`. */
  pinnedCommit: string;
  /** `az version` output's "azure-cli" value, or null. Only Module 3 onwards needs it. */
  azureCli: string | null;
  /** Names of the files present in `course/.azure/`. */
  azureMarkers: string[];
}

export type Status = "pass" | "warn" | "fail";

export interface Check {
  id: "node" | "npm" | "git" | "engine" | "azure-cli" | "cost";
  status: Status;
  message: string;
}

export interface Report {
  /** True when no check failed. Warnings do not block the offline modules. */
  ready: boolean;
  /** True when a marker says paid Azure resources exist, may exist, or cannot be ruled out. */
  billable: boolean;
  checks: Check[];
}

export const MINIMUM_NODE: Version = [22, 13, 0];
export const COST_MARKERS = ["env.json", "resources-may-exist.json", "cost-status-unknown.json"];

export function parseVersion(text: string): Version {
  // TODO: extract major.minor[.patch] from text such as 'v22.13.0' or 'git version 2.47.1'; throw 'Not a version' otherwise.
  throw new Error("Not implemented: parseVersion");
}

export function atLeast(version: Version, minimum: Version): boolean {
  // TODO: compare the three numbers in order.
  throw new Error("Not implemented: atLeast");
}

export function readiness(facts: Facts): Report {
  // TODO: one Check per id in order: node, npm, git, engine, azure-cli, cost. Warnings never make ready false.
  throw new Error("Not implemented: readiness");
}

const SYMBOL: Record<Status, string> = { pass: "✔", warn: "!", fail: "✖" };

export function summary(report: Report): string {
  // TODO: one line per check ('✔ id: message', '! ...', '✖ ...') and a final verdict line.
  throw new Error("Not implemented: summary");
}
