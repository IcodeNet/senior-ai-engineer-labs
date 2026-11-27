import { test } from "vitest";
import assert from "node:assert/strict";
import { executionOrder, initialState, runPlan, transition, validatePlan, type AgentState, type Plan, type Planner } from "./index.ts";

const tools = ["get_policy", "convert_currency", "submit_expense"];
const step = (id: string, tool: string, dependsOn: string[] = [], args: Record<string, unknown> = {}) => ({ id, tool, args, dependsOn });

const expensePlan: Plan = [
  step("policy", "get_policy", [], { topic: "meals" }),
  step("fx", "convert_currency", [], { amount: 50, from: "USD", to: "GBP" }),
  step("submit", "submit_expense", ["policy", "fx"], { converted: { $from: "fx" }, category: "meals" }),
];

test("execution order respects dependencies and otherwise keeps plan order", () => {
  assert.deepEqual(executionOrder(expensePlan), ["policy", "fx", "submit"]);
  assert.deepEqual(executionOrder([step("c", "get_policy", ["b"]), step("a", "get_policy"), step("b", "get_policy", ["a"])]), ["a", "b", "c"]);
  assert.equal(executionOrder([step("a", "get_policy", ["b"]), step("b", "get_policy", ["a"])]), null);
});

test("a sound plan has no problems", () => {
  assert.deepEqual(validatePlan(expensePlan, tools), []);
});

test("plans are rejected before anything runs", () => {
  assert.deepEqual(validatePlan([], tools), ["plan is empty"]);
  assert.deepEqual(
    validatePlan(
      [
        step("a", "get_policy"),
        step("a", "transfer_funds"),
        step("b", "submit_expense", ["zzz"], { amount: { $from: "a" } }),
      ],
      tools,
      2,
    ),
    [
      "plan has 3 steps; the limit is 2",
      'duplicate step id "a"',
      'step "a" uses unknown tool "transfer_funds"',
      'step "b" depends on unknown step "zzz"',
      'step "b" uses the result of "a" without depending on it',
    ],
  );
  assert.deepEqual(validatePlan([step("a", "get_policy", ["b"]), step("b", "get_policy", ["a"])], tools), ["plan has a dependency cycle"]);
});

test("the reducer moves planning -> executing -> done", () => {
  let state: AgentState = transition(initialState, { type: "plan", plan: expensePlan }, 1);
  assert.deepEqual(state, { status: "executing", plan: expensePlan, results: {}, replans: 0, completed: {} });
  state = transition(state, { type: "step-succeeded", stepId: "policy", result: "cap 40" }, 1);
  state = transition(state, { type: "step-succeeded", stepId: "fx", result: 40 }, 1);
  assert.equal(state.status, "executing");
  state = transition(state, { type: "step-succeeded", stepId: "submit", result: "clm-1" }, 1);
  assert.deepEqual(state, { status: "done", results: { policy: "cap 40", fx: 40, submit: "clm-1" } });
});

test("failures and rejected plans replan within the budget, then fail", () => {
  const executing = transition(initialState, { type: "plan", plan: expensePlan }, 1);
  const replanning = transition(executing, { type: "step-failed", stepId: "fx", error: "rates down" }, 1);
  assert.deepEqual(replanning, { status: "planning", replans: 1, feedback: ["step fx failed: rates down"], completed: {} });
  const executingAgain = transition(replanning, { type: "plan", plan: expensePlan }, 1);
  assert.equal(executingAgain.status === "executing" && executingAgain.replans, 1);
  assert.deepEqual(transition(executingAgain, { type: "step-failed", stepId: "fx", error: "rates down" }, 1), {
    status: "failed",
    reason: "step fx failed: rates down",
  });
  assert.deepEqual(transition(initialState, { type: "plan-rejected", problems: ["plan is empty"] }, 0), { status: "failed", reason: "invalid plan: plan is empty" });
  assert.deepEqual(transition(initialState, { type: "plan-rejected", problems: ["x", "y"] }, 2), { status: "planning", replans: 1, feedback: ["x", "y"], completed: {} });
});

test("the reducer is pure and rejects impossible transitions", () => {
  const executing = transition(initialState, { type: "plan", plan: expensePlan }, 1);
  const snapshot = structuredClone(executing);
  transition(executing, { type: "step-succeeded", stepId: "policy", result: 1 }, 1);
  assert.deepEqual(executing, snapshot, "the previous state is not mutated");
  assert.throws(() => transition(initialState, { type: "step-succeeded", stepId: "policy", result: 1 }, 1), { message: "invalid transition: step-succeeded while planning" });
  assert.throws(() => transition(executing, { type: "plan", plan: expensePlan }, 1), { message: "invalid transition: plan while executing" });
  assert.throws(() => transition(executing, { type: "step-succeeded", stepId: "nope", result: 1 }, 1), { message: "unknown or completed step: nope" });
  const once = transition(executing, { type: "step-succeeded", stepId: "policy", result: 1 }, 1);
  assert.throws(() => transition(once, { type: "step-succeeded", stepId: "policy", result: 1 }, 1), { message: "unknown or completed step: policy" });
  assert.throws(() => transition({ status: "done", results: {} }, { type: "plan", plan: expensePlan }, 1), { message: "invalid transition: plan while done" });
});

test("runPlan executes in dependency order and passes earlier results through $from", async () => {
  const calls: [string, Record<string, unknown>][] = [];
  const result = await runPlan("Claim my 50 USD dinner", {
    planner: async () => expensePlan,
    toolNames: tools,
    execute: async (tool, args) => {
      calls.push([tool, args]);
      return tool === "convert_currency" ? { gbp: 40 } : `${tool}-ok`;
    },
  });
  assert.deepEqual(calls, [
    ["get_policy", { topic: "meals" }],
    ["convert_currency", { amount: 50, from: "USD", to: "GBP" }],
    ["submit_expense", { converted: { gbp: 40 }, category: "meals" }],
  ]);
  assert.deepEqual(result.state, { status: "done", results: { policy: "get_policy-ok", fx: { gbp: 40 }, submit: "submit_expense-ok" } });
  assert.deepEqual(result.events.map((e) => e.type), ["plan", "step-succeeded", "step-succeeded", "step-succeeded"]);
});

test("an invalid plan is never executed; the planner gets the problems as feedback", async () => {
  const feedbackSeen: string[][] = [];
  const planner: Planner = async (_goal, feedback) => {
    feedbackSeen.push(feedback);
    return feedbackSeen.length === 1 ? [step("pay", "transfer_funds")] : [step("policy", "get_policy")];
  };
  let executed = 0;
  const result = await runPlan("goal", { planner, toolNames: tools, execute: async () => ++executed });
  assert.deepEqual(feedbackSeen, [[], ['step "pay" uses unknown tool "transfer_funds"']]);
  assert.equal(executed, 1);
  assert.deepEqual(result.state, { status: "done", results: { policy: 1 } });
});

test("a failing step stops the plan and replanning is bounded", async () => {
  let plans = 0;
  const executed: string[] = [];
  const result = await runPlan("goal", {
    planner: async () => (plans++, expensePlan),
    toolNames: tools,
    maxReplans: 1,
    execute: async (tool) => {
      executed.push(tool);
      if (tool === "convert_currency") throw new Error("rates down");
      return "ok";
    },
  });
  assert.equal(plans, 2);
  assert.deepEqual(executed, ["get_policy", "convert_currency", "convert_currency"], "policy is not re-run; submit never runs after fx fails");
  assert.deepEqual(result.state, { status: "failed", reason: "step fx failed: rates down" });
});

test("completed steps survive a replan, so their side effects are not repeated", () => {
  let state = transition(initialState, { type: "plan", plan: expensePlan }, 1);
  state = transition(state, { type: "step-succeeded", stepId: "policy", result: "cap 40" }, 1);
  state = transition(state, { type: "step-failed", stepId: "fx", error: "rates down" }, 1);
  assert.deepEqual(state, {
    status: "planning",
    replans: 1,
    feedback: ["step fx failed: rates down"],
    completed: { policy: { tool: "get_policy", args: { topic: "meals" }, result: "cap 40" } },
  });
  const changed = [step("policy", "get_policy", [], { topic: "travel" }), ...expensePlan.slice(1)];
  const replanned = transition(state, { type: "plan", plan: changed }, 1);
  assert.equal(replanned.status === "executing" && Object.keys(replanned.results).length, 0, "same ID with different arguments must run again");
  const same = transition(state, { type: "plan", plan: expensePlan }, 1);
  assert.equal(same.status === "executing" && same.results.policy, "cap 40", "an identical completed step is reused");
});

test("runPlan never re-submits an expense when a later step fails and the plan is retried", async () => {
  const plan: Plan = [...expensePlan, step("notify", "notify_manager", ["submit"], { claim: { $from: "submit" } })];
  const executed: string[] = [];
  let notifyAttempts = 0;
  const result = await runPlan("Claim my dinner and tell my manager", {
    planner: async () => plan,
    toolNames: [...tools, "notify_manager"],
    maxReplans: 1,
    execute: async (tool, args) => {
      executed.push(tool);
      if (tool === "notify_manager" && ++notifyAttempts === 1) throw new Error("mail server busy");
      return tool === "submit_expense" ? "clm-1" : tool === "notify_manager" ? `sent ${String(args.claim)}` : "ok";
    },
  });
  assert.deepEqual(executed, ["get_policy", "convert_currency", "submit_expense", "notify_manager", "notify_manager"]);
  assert.deepEqual(result.state, { status: "done", results: { policy: "ok", fx: "ok", submit: "clm-1", notify: "sent clm-1" } });
});
