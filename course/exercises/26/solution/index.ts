import { createHash } from "node:crypto";
import { stableStringify } from "./support.ts";

export type Impact = "read" | "write" | "irreversible";

export interface ToolPolicy {
  name: string;
  impact: Impact;
  /**
   * For `write` tools: approval is needed when `args[field]`, plus what the same principal already spent with this
   * tool inside `windowMs` (default 24 hours), reaches `amount`. Without a threshold every write needs approval.
   */
  approvalThreshold?: { field: string; amount: number; windowMs?: number };
}

export type RequestStatus = "pending" | "approved" | "rejected" | "expired" | "executed" | "failed";

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

export type AuditEvent = "auto-executed" | "requested" | "approved" | "rejected" | "expired" | "executed" | "execution-failed";

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

/**
 * The human accountable for an actor: "agent:alice" acts for "alice". Actor IDs must come from authentication,
 * never from model output or tool arguments.
 */
export function principalOf(actor: string): string {
  return actor.startsWith("agent:") ? actor.slice("agent:".length) : actor;
}

export function needsApproval(policy: ToolPolicy | undefined, args: Record<string, unknown>, alreadySpent = 0): boolean {
  if (!policy) return true;
  if (policy.impact === "read") return false;
  if (policy.impact === "irreversible") return true;
  if (!policy.approvalThreshold) return true;
  const value = args[policy.approvalThreshold.field];
  if (typeof value !== "number" || !Number.isFinite(value)) return true;
  return value + alreadySpent >= policy.approvalThreshold.amount;
}

export class ApprovalGate {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly log: AuditEntry[] = [];
  private counter = 0;
  private readonly spending: { at: number; tool: string; principal: string; amount: number }[] = [];

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

  /** What `principal` spent through auto-executed calls of this tool inside the policy's window. */
  private alreadySpent(policy: ToolPolicy | undefined, principal: string): number {
    const threshold = policy?.approvalThreshold;
    if (!threshold) return 0;
    const since = this.options.now() - (threshold.windowMs ?? 24 * 60 * 60_000);
    return this.spending
      .filter((s) => s.tool === policy.name && s.principal === principal && s.at > since)
      .reduce((total, s) => total + s.amount, 0);
  }

  private recordSpending(policy: ToolPolicy | undefined, principal: string, args: Record<string, unknown>): void {
    const field = policy?.approvalThreshold?.field;
    const amount = field === undefined ? undefined : args[field];
    if (policy && typeof amount === "number") this.spending.push({ at: this.options.now(), tool: policy.name, principal, amount });
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
    const principal = principalOf(requestedBy);
    if (!needsApproval(policy, args, this.alreadySpent(policy, principal))) {
      let result: unknown;
      try {
        result = await this.options.execute(tool, args);
      } catch (error) {
        this.record("execution-failed", tool, requestedBy);
        throw error;
      }
      this.recordSpending(policy, principal, args);
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
    if (decision.approver.startsWith("agent:")) throw new Error("agents cannot approve requests");
    if (principalOf(decision.approver) === principalOf(request.requestedBy)) throw new Error("requester cannot approve their own request");
    request.status = decision.approve ? "approved" : "rejected";
    request.decidedBy = decision.approver;
    if (decision.reason !== undefined) request.reason = decision.reason;
    this.record(decision.approve ? "approved" : "rejected", request.tool, decision.approver, request.id);
    return this.request(requestId)!;
  }

  async executeApproved(requestId: string, args: Record<string, unknown>): Promise<unknown> {
    const request = this.find(requestId);
    this.expireIfDue(request);
    if (request.status === "expired") throw new Error("request expired");
    if (request.status === "executed") throw new Error("request already executed");
    if (request.status !== "approved") throw new Error(`request is ${request.status}`);
    if (argsHash(request.tool, args) !== request.argsHash) throw new Error("arguments changed after approval");
    request.status = "executed"; // consumed before the call, so a concurrent or repeated call cannot run it twice
    try {
      const result = await this.options.execute(request.tool, structuredClone(request.args));
      this.record("executed", request.tool, request.requestedBy, request.id);
      return result;
    } catch (error) {
      request.status = "failed";
      this.record("execution-failed", request.tool, request.requestedBy, request.id);
      throw error;
    }
  }
}
