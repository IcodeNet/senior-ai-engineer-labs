import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/** MCP's recommended JSON-RPC error code for a resource that does not exist. */
export const RESOURCE_NOT_FOUND = -32002;

export interface Policy {
  id: string;
  title: string;
  text: string;
  status: "approved" | "draft";
}

export interface PolicyMatch {
  id: string;
  title: string;
}

export const SERVER_INFO = { name: "policy-server", version: "1.0.0" };

export function searchPolicies(policies: Policy[], query: string, limit: number): PolicyMatch[] {
  // TODO: approved policies only, ranked by how many query terms appear in title + text.
  throw new Error("Not implemented: searchPolicies");
}

export function createPolicyServer(policies: Policy[]): McpServer {
  // TODO: new McpServer(SERVER_INFO, { instructions }), then registerTool x2, registerResource, registerPrompt.
  // ResourceTemplate, McpError and z are imported above for you.
  throw new Error("Not implemented: createPolicyServer");
}
