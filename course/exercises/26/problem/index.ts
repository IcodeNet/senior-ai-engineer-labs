import { createHash } from "node:crypto";
import { stableStringify } from "./support.ts";

export type Impact = "read" | "write" | "irreversible";

export interface ToolPolicy {
  name: string;
  impact: Impact;
  /**
   * For `write` tools: approval is needed when `args[field]`, plus what the same principal already spent with this
   * tool inside `windowMs` (default 24 hours), reaches `amount`. Amounts are integers in minor units (pence), so
   * sums are exact. Without a threshold every write needs approval.
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
  let principal = actor;
  while (principal.startsWith("agent:")) principal = principal.slice("agent:".length);
  return principal;
}

export function needsApproval(policy: ToolPolicy | undefined, args: Record<string, unknown>, alreadySpent = 0): boolean {
  // TODO: fail closed for unknown tools and non-positive or non-integer amounts; reads never, irreversible always,
  // writes when amount + alreadySpent reaches the threshold.
  throw new Error("Not implemented: needsApproval");
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

  /** What `principal` spent or reserved through auto-executed calls of this tool inside the policy's window. */
  private alreadySpent(policy: ToolPolicy | undefined, principal: string): number {
    const threshold = policy?.approvalThreshold;
    if (!threshold) return 0;
    const since = this.options.now() - (threshold.windowMs ?? 24 * 60 * 60_000);
    return this.spending
      .filter((s) => s.tool === policy.name && s.principal === principal && s.at > since)
      .reduce((total, s) => total + s.amount, 0);
  }

  /**
   * Counts the call's amount against the running total immediately, before any `await`, so concurrent calls see
   * each other. Returns a function that releases the reservation if the call fails.
   */
  private reserve(policy: ToolPolicy | undefined, principal: string, args: Record<string, unknown>): () => void {
    const field = policy?.approvalThreshold?.field;
    const amount = field === undefined ? undefined : args[field];
    if (!policy || typeof amount !== "number" || amount <= 0) return () => {};
    const entry = { at: this.options.now(), tool: policy.name, principal, amount };
    this.spending.push(entry);
    return () => {
      const index = this.spending.indexOf(entry);
      if (index >= 0) this.spending.splice(index, 1);
    };
  }

  private find(requestId: string): ApprovalRequest {
    const found = this.requests.get(requestId);
    if (!found) throw new Error(`unknown request: ${requestId}`);
    return found;
  }

  async invoke(tool: string, args: Record<string, unknown>, requestedBy: string): Promise<InvokeResult> {
    // TODO: run low-impact calls now (check the running total, reserve before awaiting, release on failure);
    // otherwise store a pending request bound to the exact arguments.
    throw new Error("Not implemented: invoke");
  }

  decide(requestId: string, decision: { approver: string; approve: boolean; reason?: string }): ApprovalRequest {
    // TODO: expire stale requests, enforce four-eyes on principals, record the decision.
    throw new Error("Not implemented: decide");
  }

  async executeApproved(requestId: string, args: Record<string, unknown>): Promise<unknown> {
    // TODO: execute exactly the approved arguments, at most once, before expiry; audit the real outcome.
    throw new Error("Not implemented: executeApproved");
  }
}
