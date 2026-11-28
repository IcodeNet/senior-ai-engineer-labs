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
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  if (!match) throw new Error(`Not a version: ${text}`);
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

export function atLeast(version: Version, minimum: Version): boolean {
  for (let i = 0; i < 3; i++) if (version[i] !== minimum[i]) return version[i] > minimum[i];
  return true;
}

export function readiness(facts: Facts): Report {
  const checks: Check[] = [];
  let node: Version | null = null;
  try {
    node = parseVersion(facts.node);
  } catch {
    node = null;
  }
  checks.push(
    node && atLeast(node, MINIMUM_NODE)
      ? { id: "node", status: "pass", message: `Node.js ${node.join(".")}` }
      : { id: "node", status: "fail", message: `Node.js ${MINIMUM_NODE.join(".")} or later is required (found ${facts.node || "nothing"})` },
  );
  checks.push(
    facts.npm
      ? { id: "npm", status: "pass", message: `npm ${facts.npm}` }
      : { id: "npm", status: "fail", message: "npm is not on the PATH; install Node.js with npm" },
  );
  checks.push(
    facts.git
      ? { id: "git", status: "pass", message: facts.git }
      : { id: "git", status: "fail", message: "git is not on the PATH; setup clones the engine with git" },
  );
  if (facts.engineCommit === null)
    checks.push({ id: "engine", status: "fail", message: "Engine not installed: run `npm run setup`" });
  else if (facts.engineCommit !== facts.pinnedCommit)
    checks.push({
      id: "engine",
      status: "warn",
      message: `Engine ${facts.engineCommit.slice(0, 7)} differs from the pinned ${facts.pinnedCommit.slice(0, 7)}; fine for a local ICODE_ENGINE_DIR, otherwise run \`npm run setup\``,
    });
  else checks.push({ id: "engine", status: "pass", message: `Engine pinned at ${facts.pinnedCommit.slice(0, 7)}` });
  checks.push(
    facts.azureCli
      ? { id: "azure-cli", status: "pass", message: `Azure CLI ${facts.azureCli}` }
      : { id: "azure-cli", status: "warn", message: "Azure CLI not found; you need it only from Module 3, the first paid step" },
  );
  const markers = COST_MARKERS.filter((name) => facts.azureMarkers.includes(name));
  checks.push(
    markers.length === 0
      ? { id: "cost", status: "pass", message: "No course Azure resources are recorded" }
      : {
          id: "cost",
          status: "warn",
          message: `Paid Azure resources may exist (${markers.join(", ")}): run "Shut down Azure", then "Verify cost is zero"`,
        },
  );
  return { ready: checks.every((c) => c.status !== "fail"), billable: markers.length > 0, checks };
}

const SYMBOL: Record<Status, string> = { pass: "✔", warn: "!", fail: "✖" };

export function summary(report: Report): string {
  const lines = report.checks.map((c) => `${SYMBOL[c.status]} ${c.id}: ${c.message}`);
  lines.push(report.ready ? "Ready for the offline modules." : "Not ready: fix the ✖ items first.");
  return lines.join("\n");
}
