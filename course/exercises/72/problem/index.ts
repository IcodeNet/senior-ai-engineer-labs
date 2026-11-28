import { parseToolCall, type ToolDefinition } from "./support.ts";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string; isError: boolean };

export type ModelTurn = { type: "final"; text: string } | { type: "tool_calls"; calls: ToolCall[]; text?: string };

export type Model = (request: { messages: Message[]; tools: ToolDefinition[] }) => Promise<ModelTurn>;

export interface Tool extends ToolDefinition {
  run(args: Record<string, unknown>): Promise<unknown>;
}

export interface AgentOptions {
  model: Model;
  tools: Tool[];
  system: string;
  maxSteps?: number;
  maxToolCalls?: number;
}

export type StopReason = "final" | "max-steps" | "max-tool-calls" | "repeated-call";

export interface AgentResult {
  stopReason: StopReason;
  text?: string;
  messages: Message[];
  steps: number;
  toolCalls: number;
}

export async function runAgent(input: string, options: AgentOptions): Promise<AgentResult> {
  // TODO: loop model -> validate -> run tools -> append results, until a final answer or a limit is hit.
  throw new Error("Not implemented: runAgent");
}
