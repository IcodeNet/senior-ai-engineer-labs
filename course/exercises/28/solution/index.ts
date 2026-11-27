import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { RpcConnection } from "./rpc.ts";

export const CLIENT_INFO = { name: "lab-28-client", version: "1.0.0" };
export const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18"];

/** Tool names the major model APIs accept (step 22). MCP itself allows longer names and characters such as "." and "/". */
export const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

export type Capability = "tools" | "resources" | "prompts" | "logging" | "completions";

export interface Session {
  rpc: RpcConnection;
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  capabilities: Partial<Record<Capability, Record<string, unknown>>>;
  instructions?: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolOutcome {
  ok: boolean;
  text: string;
  structured?: unknown;
}

/** The step 23 tool shape, so MCP tools can be plugged into the agent loop. */
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<unknown>;
}

interface InitializeResult {
  protocolVersion: string;
  capabilities?: Session["capabilities"];
  serverInfo: Session["serverInfo"];
  instructions?: string;
}

export async function connect(transport: Transport): Promise<Session> {
  const rpc = new RpcConnection(transport);
  await rpc.start();
  const result = await rpc.request<InitializeResult>("initialize", {
    protocolVersion: SUPPORTED_VERSIONS[0],
    capabilities: {},
    clientInfo: CLIENT_INFO,
  });
  if (!SUPPORTED_VERSIONS.includes(result.protocolVersion)) {
    await rpc.close();
    throw new Error(`unsupported protocol version: ${result.protocolVersion}`);
  }
  await rpc.notify("notifications/initialized");
  return {
    rpc,
    protocolVersion: result.protocolVersion,
    serverInfo: result.serverInfo,
    capabilities: result.capabilities ?? {},
    ...(result.instructions !== undefined ? { instructions: result.instructions } : {}),
  };
}

export function supports(session: Session, capability: Capability): boolean {
  return session.capabilities[capability] !== undefined;
}

function requireCapability(session: Session, capability: Capability): void {
  if (!supports(session, capability)) throw new Error(`server does not support ${capability}`);
}

export async function listAllTools(session: Session, maxPages = 10): Promise<McpTool[]> {
  requireCapability(session, "tools");
  const tools: McpTool[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await session.rpc.request<{ tools: McpTool[]; nextCursor?: string }>("tools/list", cursor === undefined ? {} : { cursor });
    tools.push(...result.tools);
    cursor = result.nextCursor;
    if (cursor === undefined) return tools; // cursors are opaque: "" is a valid cursor, only its absence ends the list
  }
  throw new Error(`more than ${maxPages} pages of tools`);
}

export async function callTool(session: Session, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  requireCapability(session, "tools");
  const result = await session.rpc.request<{ content?: { type: string; text?: string }[]; isError?: boolean; structuredContent?: unknown }>(
    "tools/call",
    { name, arguments: args },
  );
  const text = (result.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
  return { ok: result.isError !== true, text, ...(result.structuredContent !== undefined ? { structured: result.structuredContent } : {}) };
}

export function toAgentTools(session: Session, tools: McpTool[], prefix: string): AgentTool[] {
  return tools.map((tool) => {
    const name = `${prefix}__${tool.name}`;
    if (!TOOL_NAME.test(name)) throw new Error(`tool name not accepted by model APIs: ${name}`);
    return {
      name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema,
      async run(args) {
        const outcome = await callTool(session, tool.name, args);
        if (!outcome.ok) throw new Error(outcome.text);
        return outcome.text;
      },
    };
  });
}
