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

export function executionOrder(plan: Plan): string[] | null {
  // TODO: topological order; when several steps are ready, take the earliest in the plan. null on a cycle.
  throw new Error("Not implemented: executionOrder");
}

export function validatePlan(plan: Plan, toolNames: string[], maxSteps = 6): string[] {
  // TODO: reject plans before anything runs: size, duplicate IDs, unknown tools and dependencies, undeclared $from, cycles.
  throw new Error("Not implemented: validatePlan");
}

export function transition(state: AgentState, event: AgentEvent, maxReplans: number): AgentState {
  // TODO: a pure reducer; anything not allowed in the current state throws. Carry completed steps across replans.
  throw new Error("Not implemented: transition");
}

export async function runPlan(goal: string, options: RunOptions): Promise<{ state: AgentState; events: AgentEvent[] }> {
  // TODO: plan -> validate -> execute in dependency order, driving every change through transition().
  throw new Error("Not implemented: runPlan");
}
