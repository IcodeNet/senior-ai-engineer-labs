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

function toContent(result: unknown): string {
  return typeof result === "string" ? result : JSON.stringify(result);
}

export async function runAgent(input: string, options: AgentOptions): Promise<AgentResult> {
  const { model, tools, system, maxSteps = 8, maxToolCalls = 20 } = options;
  const definitions: ToolDefinition[] = tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  const messages: Message[] = [
    { role: "system", content: system },
    { role: "user", content: input },
  ];
  const seen = new Set<string>();
  let steps = 0;
  let toolCalls = 0;
  const stop = (stopReason: StopReason, text?: string): AgentResult => ({ stopReason, text, messages, steps, toolCalls });

  while (steps < maxSteps) {
    steps++;
    const turn = await model({ messages: [...messages], tools: definitions });
    if (turn.type === "final") {
      messages.push({ role: "assistant", content: turn.text });
      return stop("final", turn.text);
    }
    messages.push({ role: "assistant", content: turn.text ?? "", toolCalls: turn.calls });
    for (const call of turn.calls) {
      const signature = `${call.name}\n${call.arguments}`;
      if (seen.has(signature)) return stop("repeated-call");
      if (toolCalls >= maxToolCalls) return stop("max-tool-calls");
      seen.add(signature);
      toolCalls++;
      const reply = (content: string, isError: boolean): void => {
        messages.push({ role: "tool", toolCallId: call.id, name: call.name, content, isError });
      };
      const parsed = parseToolCall(definitions, call);
      if (!parsed.ok) {
        reply(parsed.message, true);
        continue;
      }
      const tool = tools.find((candidate) => candidate.name === parsed.name)!;
      try {
        reply(toContent(await tool.run(parsed.args)), false);
      } catch (error) {
        reply(`Tool error: ${error instanceof Error ? error.message : String(error)}`, true);
      }
    }
  }
  return stop("max-steps");
}
