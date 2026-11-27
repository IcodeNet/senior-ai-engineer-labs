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

const SENSITIVE: Classification[] = ["confidential", "restricted"];

function isSideEffecting(tool: Tool): boolean {
  return tool.sideEffect === "write" || tool.sideEffect === "payment";
}

export function minimumRetentionDays(classification: Classification): number {
  return SENSITIVE.includes(classification) ? 365 : 90;
}

export function reviewDesign(spec: ArchitectureSpec): Finding[] {
  const findings: Finding[] = [];
  const add = (control: Control, severity: Finding["severity"], subject: string, message: string) =>
    findings.push({ control, severity, subject, message });
  const sideEffecting = spec.tools.filter(isSideEffecting);

  if (spec.dataResidency !== null)
    for (const c of spec.components)
      if (c.region !== spec.dataResidency)
        add("data-residency", "high", c.id, `${c.id} runs in ${c.region}; data must stay in ${spec.dataResidency}.`);

  for (const tool of sideEffecting)
    if (!tool.requiresApproval)
      add("human-approval", "high", tool.id, `${tool.id} has ${tool.sideEffect} side effects but runs without human approval.`);

  if (sideEffecting.length > 0 && !spec.audit.logsToolCalls)
    add("audit", "high", "tool-calls", "Side-effecting tool calls are not recorded in the audit log.");
  if (!spec.audit.logsPrompts) add("audit", "medium", "prompts", "Prompts and responses are not logged, so answers cannot be reconstructed.");
  const minimum = minimumRetentionDays(spec.classification);
  if (spec.audit.retentionDays < minimum)
    add("audit", "medium", "retention", `Audit retention of ${spec.audit.retentionDays} days is below the ${minimum}-day minimum.`);

  if (spec.audit.logsPrompts && !spec.audit.redactsPii && SENSITIVE.includes(spec.classification))
    add("pii-redaction", "high", "logs", `Prompts with ${spec.classification} data are logged without PII redaction.`);

  if (spec.injection.untrustedInputs.length > 0) {
    if (!spec.injection.separatesInstructions)
      add("prompt-injection", "high", "instructions", `Untrusted input (${spec.injection.untrustedInputs.join(", ")}) is not separated from instructions.`);
    if (sideEffecting.length > 0 && !spec.injection.validatesToolArguments)
      add("prompt-injection", "high", "tool-arguments", "Model-proposed tool arguments are not validated before side-effecting calls.");
  }

  if (spec.cost.maxTokensPerRequest === null) add("cost-cap", "medium", "per-request", "No per-request token limit.");
  if (!spec.cost.hardMonthlyCap)
    add("cost-cap", "medium", "monthly", "No enforced monthly cap; budget alerts notify but do not stop spending.");

  if (spec.retrieval !== null && !spec.retrieval.enforcesAccessInBackend && spec.classification !== "public")
    add("access-control", "high", "retrieval", "Document access is not enforced in the retrieval backend.");

  const rank = { high: 0, medium: 1 };
  return findings.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || a.control.localeCompare(b.control) || a.subject.localeCompare(b.subject),
  );
}

export function verdict(findings: Finding[]): Verdict {
  if (findings.some(f => f.severity === "high")) return "reject";
  return findings.length > 0 ? "approve-with-conditions" : "approve";
}
