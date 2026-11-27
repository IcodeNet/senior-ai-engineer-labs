import { isDeepStrictEqual } from "node:util";

export interface PlanStep {
  id: string;
  tool: string;
  /** Argument values may be `{ "$from": "<stepId>" }` to use an earlier step's result. */
  args: Record<string, unknown>;
  dependsOn: string[];
}

export type Plan = PlanStep[];

/** A step that already ran (and so already had its side effects), kept across replans. */
export interface CompletedStep {
  tool: string;
  /** The resolved arguments it ran with (`$from` references replaced by results). */
  args: Record<string, unknown>;
  result: unknown;
}

export type AgentState =
  | { status: "planning"; replans: number; feedback: string[]; completed: Record<string, CompletedStep> }
  | { status: "executing"; plan: Plan; results: Record<string, unknown>; replans: number; completed: Record<string, CompletedStep> }
  | { status: "done"; results: Record<string, unknown> }
  | { status: "failed"; reason: string };

export type AgentEvent =
  | { type: "plan"; plan: Plan }
  | { type: "plan-rejected"; problems: string[] }
  | { type: "step-succeeded"; stepId: string; result: unknown }
  | { type: "step-failed"; stepId: string; error: string };

export type Planner = (goal: string, feedback: string[]) => Promise<Plan>;
export type Executor = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

export interface RunOptions {
  planner: Planner;
  execute: Executor;
  toolNames: string[];
  maxReplans?: number;
  maxSteps?: number;
}

export const initialState: AgentState = { status: "planning", replans: 0, feedback: [], completed: {} };

/** Returns the step ID if `value` is a `{ "$from": "<stepId>" }` reference. */
export function reference(value: unknown): string | undefined {
  if (typeof value === "object" && value !== null && Object.hasOwn(value, "$from")) {
    const from = (value as { $from: unknown }).$from;
    return typeof from === "string" ? from : undefined;
  }
  return undefined;
}

/** A step's arguments with every `{ "$from": id }` replaced by that step's result (undefined if it has none yet). */
export function resolveArgs(step: PlanStep, results: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(step.args).map(([key, value]) => {
      const from = reference(value);
      return [key, from === undefined ? value : Object.hasOwn(results, from) ? results[from] : undefined];
    }),
  );
}

export function executionOrder(plan: Plan): string[] | null {
  const done = new Set<string>();
  const order: string[] = [];
  while (order.length < plan.length) {
    const next = plan.find((step) => !done.has(step.id) && step.dependsOn.every((dep) => done.has(dep)));
    if (!next) return null;
    done.add(next.id);
    order.push(next.id);
  }
  return order;
}

export function validatePlan(plan: Plan, toolNames: string[], maxSteps = 6): string[] {
  if (plan.length === 0) return ["plan is empty"];
  const problems: string[] = [];
  if (plan.length > maxSteps) problems.push(`plan has ${plan.length} steps; the limit is ${maxSteps}`);
  const ids = new Set<string>();
  for (const step of plan) {
    if (ids.has(step.id)) problems.push(`duplicate step id "${step.id}"`);
    ids.add(step.id);
  }
  let danglingDependency = false;
  for (const step of plan) {
    if (!toolNames.includes(step.tool)) problems.push(`step "${step.id}" uses unknown tool "${step.tool}"`);
    for (const dep of step.dependsOn)
      if (!ids.has(dep)) {
        danglingDependency = true;
        problems.push(`step "${step.id}" depends on unknown step "${dep}"`);
      }
    for (const value of Object.values(step.args)) {
      const from = reference(value);
      if (from !== undefined && !step.dependsOn.includes(from))
        problems.push(`step "${step.id}" uses the result of "${from}" without depending on it`);
    }
  }
  if (!danglingDependency && problems.every((p) => !p.startsWith("duplicate")) && executionOrder(plan) === null)
    problems.push("plan has a dependency cycle");
  return problems;
}

export function transition(state: AgentState, event: AgentEvent, maxReplans: number): AgentState {
  const invalid = (): never => {
    throw new Error(`invalid transition: ${event.type} while ${state.status}`);
  };
  const replanOrFail = (replans: number, feedback: string[], reason: string, completed: Record<string, CompletedStep>): AgentState =>
    replans < maxReplans ? { status: "planning", replans: replans + 1, feedback, completed } : { status: "failed", reason };

  if (state.status === "planning") {
    if (event.type === "plan") {
      // Reuse a completed step only if it would run with exactly the same resolved inputs: walking in dependency
      // order means a re-run upstream step leaves its dependants' `$from` inputs unresolved, so they re-run too.
      const results: Record<string, unknown> = {};
      const order = executionOrder(event.plan) ?? event.plan.map((step) => step.id);
      for (const id of order) {
        const step = event.plan.find((candidate) => candidate.id === id)!;
        const done = Object.hasOwn(state.completed, step.id) ? state.completed[step.id] : undefined;
        if (done && done.tool === step.tool && isDeepStrictEqual(done.args, resolveArgs(step, results))) results[step.id] = done.result;
      }
      if (event.plan.every((step) => Object.hasOwn(results, step.id))) return { status: "done", results };
      return { status: "executing", plan: event.plan, results, replans: state.replans, completed: state.completed };
    }
    if (event.type === "plan-rejected")
      return replanOrFail(state.replans, event.problems, `invalid plan: ${event.problems.join("; ")}`, state.completed);
    return invalid();
  }
  if (state.status === "executing") {
    if (event.type !== "step-succeeded" && event.type !== "step-failed") return invalid();
    const step = state.plan.find((candidate) => candidate.id === event.stepId);
    if (!step || Object.hasOwn(state.results, event.stepId)) throw new Error(`unknown or completed step: ${event.stepId}`);
    if (event.type === "step-failed") {
      const message = `step ${event.stepId} failed: ${event.error}`;
      return replanOrFail(state.replans, [message], message, state.completed);
    }
    const results = { ...state.results, [event.stepId]: event.result };
    const completed = { ...state.completed, [event.stepId]: { tool: step.tool, args: resolveArgs(step, state.results), result: event.result } };
    if (state.plan.every((candidate) => Object.hasOwn(results, candidate.id))) return { status: "done", results };
    return { ...state, results, completed };
  }
  return invalid();
}

export async function runPlan(goal: string, options: RunOptions): Promise<{ state: AgentState; events: AgentEvent[] }> {
  const { planner, execute, toolNames, maxReplans = 1, maxSteps = 6 } = options;
  const events: AgentEvent[] = [];
  let state: AgentState = initialState;
  const apply = (event: AgentEvent): void => {
    events.push(event);
    state = transition(state, event, maxReplans);
  };

  while (state.status === "planning" || state.status === "executing") {
    if (state.status === "planning") {
      const plan = await planner(goal, state.feedback);
      const problems = validatePlan(plan, toolNames, maxSteps);
      apply(problems.length > 0 ? { type: "plan-rejected", problems } : { type: "plan", plan });
      continue;
    }
    const executing: Extract<AgentState, { status: "executing" }> = state;
    const eventsBefore = events.length;
    for (const id of executionOrder(executing.plan) ?? []) {
      const current: AgentState = state;
      if (current.status !== "executing") break;
      if (Object.hasOwn(current.results, id)) continue; // already ran before a replan: do not repeat its side effects
      const step = executing.plan.find((candidate) => candidate.id === id)!;
      try {
        apply({ type: "step-succeeded", stepId: id, result: await execute(step.tool, resolveArgs(step, current.results)) });
      } catch (error) {
        apply({ type: "step-failed", stepId: id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    // A pass that emits no event can never finish: fail loudly instead of spinning forever.
    if (events.length === eventsBefore) throw new Error("runPlan made no progress");
  }
  return { state, events };
}
