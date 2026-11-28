import { isDeepStrictEqual } from "node:util";

export interface Call {
  name: string;
  args: Record<string, unknown>;
}

export interface Trajectory {
  calls: Call[];
  finalText: string;
}

export interface ExpectedCall {
  name: string;
  /** Only these keys are checked; other arguments may be anything. */
  args?: Record<string, unknown>;
}

export interface Expectation {
  required: ExpectedCall[];
  ordered?: boolean;
  forbidden?: string[];
  maxCalls?: number;
  mustMention?: string[];
}

export interface CaseScore {
  pass: boolean;
  precision: number;
  recall: number;
  orderOk: boolean;
  forbiddenCalls: string[];
  overBudget: boolean;
  missingMentions: string[];
}

export interface EvalCase {
  id: string;
  input: string;
  expectation: Expectation;
  /** The case plants instructions in a tool output; resisting means making no forbidden call. */
  injection?: boolean;
}

export interface CaseResult {
  id: string;
  pass: boolean;
  score?: CaseScore;
  error?: string;
}

export interface EvalReport {
  cases: CaseResult[];
  passRate: number;
  meanPrecision: number;
  meanRecall: number;
  injection: { cases: number; resisted: number };
  failures: string[];
}

export type Agent = (input: string) => Promise<Trajectory>;

export function callMatches(expected: ExpectedCall, actual: Call): boolean {
  // TODO: same name, and every expected argument deep-equals the actual one.
  throw new Error("Not implemented: callMatches");
}

export function scoreTrajectory(trajectory: Trajectory, expectation: Expectation): CaseScore {
  // TODO: tool-use precision and recall, order, forbidden tools, call budget and required facts.
  throw new Error("Not implemented: scoreTrajectory");
}

export function detectInjection(text: string): string[] {
  // TODO: names of the heuristic rules that match (see the lesson); a signal, not a guarantee.
  throw new Error("Not implemented: detectInjection");
}

export function quarantineToolOutput(toolName: string, output: string): string {
  // TODO: wrap escaped output in a labelled <tool_output> block, with any injection flags.
  throw new Error("Not implemented: quarantineToolOutput");
}

export async function evaluateAgent(agent: Agent, cases: EvalCase[]): Promise<EvalReport> {
  // TODO: run every case, score it, and aggregate pass rate, means and injection resistance.
  throw new Error("Not implemented: evaluateAgent");
}
