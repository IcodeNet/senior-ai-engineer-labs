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
  audit: { logsPrompts: boolean; logsToolCalls: boolean; redactsPii: boolean; retentionDays: number };
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
