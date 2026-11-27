import { test } from "vitest";
import assert from "node:assert/strict";
import { ApprovalGate, argsHash, needsApproval, principalOf, type ToolPolicy } from "./index.ts";

const policies: ToolPolicy[] = [
  { name: "get_policy", impact: "read" },
  { name: "submit_expense", impact: "write", approvalThreshold: { field: "amount", amount: 500, windowMs: 60_000 } },
  { name: "update_profile", impact: "write" },
  { name: "issue_refund", impact: "irreversible" },
];

function setup(ttlMs?: number, fail?: (tool: string) => boolean) {
  let clock = 1_000;
  const executed: [string, Record<string, unknown>][] = [];
  const gate = new ApprovalGate({
    policies,
    now: () => clock,
    ttlMs,
    execute: async (tool, args) => {
      executed.push([tool, args]);
      if (fail?.(tool)) throw new Error(`${tool} failed downstream`);
      return `${tool} done`;
    },
  });
  return { gate, executed, advance: (ms: number) => void (clock += ms) };
}

const refund = { claimId: "clm-7", amount: 120, currency: "GBP" };

test("approval policy: reads never, irreversible always, writes above a threshold, unknown tools fail closed", () => {
  assert.equal(needsApproval(policies[0], {}), false);
  assert.equal(needsApproval(policies[1], { amount: 499.99 }), false);
  assert.equal(needsApproval(policies[1], { amount: 500 }), true);
  assert.equal(needsApproval(policies[1], { amount: "lots" }), true, "a non-numeric amount cannot be trusted below the threshold");
  assert.equal(needsApproval(policies[1], {}), true);
  assert.equal(needsApproval(policies[2], {}), true, "a write without a threshold always needs approval");
  assert.equal(needsApproval(policies[3], { amount: 1 }), true);
  assert.equal(needsApproval(undefined, {}), true);
  assert.equal(needsApproval(policies[1], { amount: 100 }, 400), true, "what was already spent counts towards the threshold");
  assert.equal(needsApproval(policies[1], { amount: 100 }, 399), false);
});

test("low-impact calls run immediately and are audited", async () => {
  const { gate, executed } = setup();
  assert.deepEqual(await gate.invoke("get_policy", { topic: "meals" }, "agent:alice"), { status: "executed", result: "get_policy done" });
  assert.deepEqual(await gate.invoke("submit_expense", { amount: 40 }, "agent:alice"), { status: "executed", result: "submit_expense done" });
  assert.equal(executed.length, 2);
  assert.deepEqual(gate.audit, [
    { at: 1_000, event: "auto-executed", tool: "get_policy", actor: "agent:alice" },
    { at: 1_000, event: "auto-executed", tool: "submit_expense", actor: "agent:alice" },
  ]);
});

test("high-impact calls are suspended as a pending request bound to the exact arguments", async () => {
  const { gate, executed } = setup();
  const result = await gate.invoke("issue_refund", refund, "alice");
  assert.deepEqual(result, { status: "pending", requestId: "apr-1" });
  assert.equal(executed.length, 0, "nothing runs before approval");
  assert.deepEqual(gate.request("apr-1"), {
    id: "apr-1",
    tool: "issue_refund",
    args: refund,
    argsHash: argsHash("issue_refund", refund),
    requestedBy: "alice",
    createdAt: 1_000,
    expiresAt: 1_000 + 15 * 60_000,
    status: "pending",
  });
  assert.equal((await gate.invoke("issue_refund", refund, "alice")).status === "pending", true);
  assert.equal(gate.request("apr-2")?.id, "apr-2");
});

test("the stored request cannot be changed through the caller's object", async () => {
  const { gate } = setup();
  const args = { ...refund };
  await gate.invoke("issue_refund", args, "alice");
  args.amount = 99_999;
  assert.equal(gate.request("apr-1")?.args.amount, 120);
});

test("an approved request executes once with exactly the approved arguments", async () => {
  const { gate, executed, advance } = setup();
  await gate.invoke("issue_refund", refund, "alice");
  advance(60_000);
  const decided = gate.decide("apr-1", { approver: "bob", approve: true, reason: "receipt checked" });
  assert.equal(decided.status, "approved");
  assert.equal(decided.decidedBy, "bob");
  assert.equal(decided.reason, "receipt checked");
  await assert.rejects(gate.executeApproved("apr-1", { ...refund, amount: 1200 }), { message: "arguments changed after approval" });
  assert.equal(await gate.executeApproved("apr-1", { currency: "GBP", amount: 120, claimId: "clm-7" }), "issue_refund done");
  await assert.rejects(gate.executeApproved("apr-1", refund), { message: "request already executed" });
  assert.deepEqual(executed, [["issue_refund", refund]]);
  assert.deepEqual(
    gate.audit.map((e) => [e.event, e.actor, e.at]),
    [
      ["requested", "alice", 1_000],
      ["approved", "bob", 61_000],
      ["executed", "alice", 61_000],
    ],
  );
});

test("four-eyes: the requester cannot approve their own request", async () => {
  const { gate } = setup();
  await gate.invoke("issue_refund", refund, "alice");
  assert.throws(() => gate.decide("apr-1", { approver: "alice", approve: true }), { message: "requester cannot approve their own request" });
  assert.equal(gate.request("apr-1")?.status, "pending");
});

test("four-eyes holds through an agent: alice cannot approve what her agent requested, and agents cannot approve", async () => {
  assert.equal(principalOf("agent:alice"), "alice");
  const { gate } = setup();
  await gate.invoke("issue_refund", refund, "agent:alice");
  assert.throws(() => gate.decide("apr-1", { approver: "alice", approve: true }), { message: "requester cannot approve their own request" });
  assert.throws(() => gate.decide("apr-1", { approver: "agent:bob", approve: true }), { message: "agents cannot approve requests" });
  assert.equal(gate.decide("apr-1", { approver: "bob", approve: true }).status, "approved");
});

test("splitting a payment below the threshold is caught by the per-principal running total", async () => {
  const { gate, executed, advance } = setup();
  const results = [];
  for (let i = 0; i < 5; i++) results.push((await gate.invoke("submit_expense", { amount: 120 }, i % 2 ? "alice" : "agent:alice")).status);
  assert.deepEqual(results, ["executed", "executed", "executed", "executed", "pending"], "480 auto-approved; the fifth would reach 600");
  assert.equal((await gate.invoke("submit_expense", { amount: 120 }, "carol")).status, "executed", "another person's total is separate");
  advance(60_000);
  assert.equal((await gate.invoke("submit_expense", { amount: 120 }, "alice")).status, "executed", "the window has passed");
  assert.equal(executed.length, 6);
});

test("the audit records failed executions as failures, and a failed approval is still used up", async () => {
  const { gate } = setup(undefined, (tool) => tool !== "get_policy");
  await assert.rejects(gate.invoke("submit_expense", { amount: 10 }, "alice"), { message: "submit_expense failed downstream" });
  await gate.invoke("issue_refund", refund, "alice");
  gate.decide("apr-1", { approver: "bob", approve: true });
  await assert.rejects(gate.executeApproved("apr-1", refund), { message: "issue_refund failed downstream" });
  assert.equal(gate.request("apr-1")?.status, "failed");
  await assert.rejects(gate.executeApproved("apr-1", refund), { message: "request is failed" });
  assert.deepEqual(gate.audit.map((e) => e.event), ["execution-failed", "requested", "approved", "execution-failed"]);
});

test("rejected, unknown and undecided requests never execute", async () => {
  const { gate, executed } = setup();
  await gate.invoke("issue_refund", refund, "alice");
  await assert.rejects(gate.executeApproved("apr-1", refund), { message: "request is pending" });
  gate.decide("apr-1", { approver: "bob", approve: false, reason: "duplicate claim" });
  await assert.rejects(gate.executeApproved("apr-1", refund), { message: "request is rejected" });
  assert.throws(() => gate.decide("apr-1", { approver: "carol", approve: true }), { message: "request is rejected" });
  assert.throws(() => gate.decide("apr-404", { approver: "bob", approve: true }), { message: "unknown request: apr-404" });
  await assert.rejects(gate.executeApproved("apr-404", refund), { message: "unknown request: apr-404" });
  assert.equal(executed.length, 0);
  assert.deepEqual(gate.audit.map((e) => e.event), ["requested", "rejected"]);
});

test("requests expire: stale approvals cannot be decided or executed", async () => {
  const { gate, executed, advance } = setup(10_000);
  await gate.invoke("issue_refund", refund, "alice");
  advance(10_000);
  assert.throws(() => gate.decide("apr-1", { approver: "bob", approve: true }), { message: "request expired" });
  assert.equal(gate.request("apr-1")?.status, "expired");

  await gate.invoke("issue_refund", refund, "alice");
  gate.decide("apr-2", { approver: "bob", approve: true });
  advance(10_000);
  await assert.rejects(gate.executeApproved("apr-2", refund), { message: "request expired" });
  assert.equal(executed.length, 0);
  assert.deepEqual(gate.audit.map((e) => `${e.event}:${e.actor}`), ["requested:alice", "expired:system", "requested:alice", "approved:bob", "expired:system"]);
});
