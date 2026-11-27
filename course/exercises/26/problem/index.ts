import { createHash } from "node:crypto";
import { stableStringify } from "./support.ts";

export type Impact = "read" | "write" | "irreversible";

export interface ToolPolicy {
  name: string;
  impact: Impact;
  /** For `write` tools: approval is needed when `args[field] >= amount`. Without it every write needs approval. */
  approvalThreshold?: { field: string; amount: number };
}

export type RequestStatus = "pending" | "approved" | "rejected" | "expired" | "executed";

export interface ApprovalRequest {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  argsHash: string;
  requestedBy: string;
  createdAt: number;
  expiresAt: number;
  status: RequestStatus;
  decidedBy?: string;
  reason?: string;
}

export type AuditEvent = "auto-executed" | "requested" | "approved" | "rejected" | "expired" | "executed";

export interface AuditEntry {
  at: number;
  event: AuditEvent;
  tool: string;
  actor: string;
  requestId?: string;
}

export interface GateOptions {
  policies: ToolPolicy[];
  execute: (tool: string, args: Record<string, unknown>) => Promise<unknown>;
  now: () => number;
  ttlMs?: number;
}

export type InvokeResult = { status: "executed"; result: unknown } | { status: "pending"; requestId: string };

export function argsHash(tool: string, args: Record<string, unknown>): string {
  return createHash("sha256").update(stableStringify({ tool, args })).digest("hex");
}

export function needsApproval(policy: ToolPolicy | undefined, args: Record<string, unknown>): boolean {
  // TODO: fail closed for unknown tools; reads never, irreversible always, writes at or above the threshold.
  throw new Error("Not implemented: needsApproval");
}

export class ApprovalGate {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly log: AuditEntry[] = [];
  private counter = 0;

  constructor(private readonly options: GateOptions) {}

  get audit(): AuditEntry[] {
    return this.log.map((entry) => ({ ...entry }));
  }

  request(id: string): ApprovalRequest | undefined {
    const found = this.requests.get(id);
    return found && { ...found, args: structuredClone(found.args) };
  }

  private record(event: AuditEvent, tool: string, actor: string, requestId?: string): void {
    this.log.push({ at: this.options.now(), event, tool, actor, ...(requestId ? { requestId } : {}) });
  }

  private find(requestId: string): ApprovalRequest {
    const found = this.requests.get(requestId);
    if (!found) throw new Error(`unknown request: ${requestId}`);
    return found;
  }

  async invoke(tool: string, args: Record<string, unknown>, requestedBy: string): Promise<InvokeResult> {
    // TODO: run low-impact calls now; otherwise store a pending request bound to the exact arguments.
    throw new Error("Not implemented: invoke");
  }

  decide(requestId: string, decision: { approver: string; approve: boolean; reason?: string }): ApprovalRequest {
    // TODO: expire stale requests, enforce four-eyes, record the decision.
    throw new Error("Not implemented: decide");
  }

  async executeApproved(requestId: string, args: Record<string, unknown>): Promise<unknown> {
    // TODO: execute exactly the approved arguments, at most once, before expiry.
    throw new Error("Not implemented: executeApproved");
  }
}
