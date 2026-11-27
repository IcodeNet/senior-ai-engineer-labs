import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { RpcConnection } from "./rpc.ts";

export const CLIENT_INFO = { name: "lab-28-client", version: "1.0.0" };
export const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18"];

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
  // TODO: start an RpcConnection, send initialize, check the negotiated version, send notifications/initialized.
  throw new Error("Not implemented: connect");
}

export function supports(session: Session, capability: Capability): boolean {
  // TODO: a capability is supported when the server declared it during initialize.
  throw new Error("Not implemented: supports");
}

export async function listAllTools(session: Session, maxPages = 10): Promise<McpTool[]> {
  // TODO: follow nextCursor, but never forever.
  throw new Error("Not implemented: listAllTools");
}

export async function callTool(session: Session, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  // TODO: tools/call; isError is an outcome, JSON-RPC errors propagate.
  throw new Error("Not implemented: callTool");
}

export function toAgentTools(session: Session, tools: McpTool[], prefix: string): AgentTool[] {
  // TODO: namespace each tool and adapt it to the step 23 Tool shape.
  throw new Error("Not implemented: toAgentTools");
}
