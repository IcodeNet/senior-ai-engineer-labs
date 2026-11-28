export type Classification = "public" | "internal" | "confidential" | "restricted";

export interface Component {
  id: string;
  kind: "llm" | "vector-store" | "log-store" | "api" | "tool-runtime";
  region: string;
}

export interface Tool {
  id: string;
  sideEffect: "none" | "read" | "write" | "payment";
  requiresApproval: boolean;
}

export interface ArchitectureSpec {
  name: string;
  classification: Classification;
  /** Region data must stay in, or null when there is no residency requirement. */
  dataResidency: string | null;
  components: Component[];
  tools: Tool[];
  audit: {
    logsPrompts: boolean;
    logsToolCalls: boolean;
    redactsPii: boolean;
    retentionDays: number;
    /** Longest retention the records policy allows (storage limitation for personal data), or null if unbounded. */
    maxRetentionDays: number | null;
  };
  injection: { untrustedInputs: string[]; separatesInstructions: boolean; validatesToolArguments: boolean };
  cost: { maxTokensPerRequest: number | null; hardMonthlyCap: boolean };
  /** Null when the design has no retrieval. */
  retrieval: { enforcesAccessInBackend: boolean } | null;
}

export type Control =
  | "access-control"
  | "audit"
  | "cost-cap"
  | "data-residency"
  | "human-approval"
  | "pii-redaction"
  | "prompt-injection";

export interface Finding {
  control: Control;
  severity: "high" | "medium";
  subject: string;
  message: string;
}

export type Verdict = "approve" | "approve-with-conditions" | "reject";

/** Azure region names mapped to the geography used for residency (provided; extend for your estate). */
const GEOGRAPHY: Record<string, string> = {
  westeurope: "eu",
  northeurope: "eu",
  swedencentral: "eu",
  francecentral: "eu",
  germanywestcentral: "eu",
  uksouth: "uk",
  ukwest: "uk",
  eastus: "us",
  eastus2: "us",
  westus: "us",
};

/** Normalise a region or geography name: case and spaces are ignored, known regions map to their geography. */
export function regionGeography(region: string): string {
  const key = region.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return GEOGRAPHY[key] ?? key;
}

export function minimumRetentionDays(classification: Classification): number {
  // TODO: 365 days for confidential and restricted data, otherwise 90.
  throw new Error("Not implemented: minimumRetentionDays");
}

export function reviewDesign(spec: ArchitectureSpec): Finding[] {
  // TODO: apply each control rule, then sort by severity, control and subject.
  throw new Error("Not implemented: reviewDesign");
}

export function verdict(findings: Finding[]): Verdict {
  // TODO: reject on any high finding, conditions on medium only, approve on none.
  throw new Error("Not implemented: verdict");
}
