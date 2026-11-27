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
  if (!policy) return true;
  if (policy.impact === "read") return false;
  if (policy.impact === "irreversible") return true;
  if (!policy.approvalThreshold) return true;
  const value = args[policy.approvalThreshold.field];
  if (typeof value !== "number" || !Number.isFinite(value)) return true;
  return value >= policy.approvalThreshold.amount;
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

  private expireIfDue(request: ApprovalRequest): void {
    if ((request.status === "pending" || request.status === "approved") && this.options.now() >= request.expiresAt) {
      request.status = "expired";
      this.record("expired", request.tool, "system", request.id);
    }
  }

  async invoke(tool: string, args: Record<string, unknown>, requestedBy: string): Promise<InvokeResult> {
    const policy = this.options.policies.find((p) => p.name === tool);
    if (!needsApproval(policy, args)) {
      const result = await this.options.execute(tool, args);
      this.record("auto-executed", tool, requestedBy);
      return { status: "executed", result };
    }
    const now = this.options.now();
    const id = `apr-${++this.counter}`;
    this.requests.set(id, {
      id,
      tool,
      args: structuredClone(args),
      argsHash: argsHash(tool, args),
      requestedBy,
      createdAt: now,
      expiresAt: now + (this.options.ttlMs ?? 15 * 60_000),
      status: "pending",
    });
    this.record("requested", tool, requestedBy, id);
    return { status: "pending", requestId: id };
  }

  decide(requestId: string, decision: { approver: string; approve: boolean; reason?: string }): ApprovalRequest {
    const request = this.find(requestId);
    this.expireIfDue(request);
    if (request.status === "expired") throw new Error("request expired");
    if (request.status !== "pending") throw new Error(`request is ${request.status}`);
    if (decision.approver === request.requestedBy) throw new Error("requester cannot approve their own request");
    request.status = decision.approve ? "approved" : "rejected";
    request.decidedBy = decision.approver;
    if (decision.reason !== undefined) request.reason = decision.reason;
    this.record(decision.approve ? "approved" : "rejected", request.tool, decision.approver, request.id);
    return this.request(requestId)!;
  }

  async executeApproved(requestId: string, args: Record<string, unknown>): Promise<unknown> {
    const request = this.find(requestId);
    this.expireIfDue(request);
    if (request.status === "executed") throw new Error("request already executed");
    if (request.status !== "approved") throw new Error(`request is ${request.status}`);
    if (argsHash(request.tool, args) !== request.argsHash) throw new Error("arguments changed after approval");
    request.status = "executed";
    this.record("executed", request.tool, request.requestedBy, request.id);
    return this.options.execute(request.tool, structuredClone(request.args));
  }
}
