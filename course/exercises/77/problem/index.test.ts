import { test } from "vitest";
import assert from "node:assert/strict";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";
import { CLIENT_INFO, SUPPORTED_VERSIONS, callTool, connect, listAllTools, supports, toAgentTools } from "./index.ts";
import { RpcError, scriptedServer, type ScriptedReply } from "./rpc.ts";

const init = (overrides: Record<string, unknown> = {}): ScriptedReply => ({
  protocolVersion: "2025-11-25",
  capabilities: { tools: {} },
  serverInfo: { name: "fake", version: "0.1.0" },
  ...overrides,
});

function fake(handle: (method: string, params?: Record<string, unknown>) => ScriptedReply) {
  const [client, server] = InMemoryTransport.createLinkedPair();
  return { transport: client, server: scriptedServer(server, handle) };
}

const tool = (name: string) => ({ name, description: `${name} tool`, inputSchema: { type: "object", properties: {} } });

test("the handshake: initialize with our latest version and info, then the initialized notification", async () => {
  const { transport, server } = fake((method) => (method === "initialize" ? init({ instructions: "Be careful." }) : {}));
  const session = await connect(transport);
  assert.deepEqual(server.received[0], {
    method: "initialize",
    params: { protocolVersion: SUPPORTED_VERSIONS[0], capabilities: {}, clientInfo: CLIENT_INFO },
  });
  assert.deepEqual(server.received[1], { method: "notifications/initialized" });
  assert.equal(session.protocolVersion, "2025-11-25");
  assert.deepEqual(session.serverInfo, { name: "fake", version: "0.1.0" });
  assert.deepEqual(session.capabilities, { tools: {} });
  assert.equal(session.instructions, "Be careful.");
});

test("an older version we support is accepted; one we do not is refused and the connection closed", async () => {
  const older = await connect(fake((m) => (m === "initialize" ? init({ protocolVersion: "2025-06-18" }) : {})).transport);
  assert.equal(older.protocolVersion, "2025-06-18");

  const { transport, server } = fake((m) => (m === "initialize" ? init({ protocolVersion: "2024-11-05" }) : {}));
  await assert.rejects(connect(transport), { message: "unsupported protocol version: 2024-11-05" });
  assert.equal(server.closed(), true);
  assert.deepEqual(server.received.map((r) => r.method), ["initialize"], "no initialized notification after a failed negotiation");
});

test("capabilities gate what the client may ask for", async () => {
  const { transport, server } = fake((m) => (m === "initialize" ? init({ capabilities: { resources: { subscribe: true } } }) : {}));
  const session = await connect(transport);
  assert.equal(supports(session, "resources"), true);
  assert.equal(supports(session, "tools"), false);
  assert.equal(supports(session, "prompts"), false);
  await assert.rejects(listAllTools(session), { message: "server does not support tools" });
  await assert.rejects(callTool(session, "x", {}), { message: "server does not support tools" });
  assert.deepEqual(server.received.map((r) => r.method), ["initialize", "notifications/initialized"], "nothing unsupported was sent");
});

test("tools/list is paginated with cursors until there is no nextCursor", async () => {
  const pages: Record<string, ScriptedReply> = {
    "": { tools: [tool("a"), tool("b")], nextCursor: "p2" },
    p2: { tools: [tool("c")], nextCursor: "p3" },
    p3: { tools: [tool("d")] },
  };
  const { transport, server } = fake((m, params) => (m === "initialize" ? init() : pages[String(params?.cursor ?? "")]));
  const tools = await listAllTools(await connect(transport));
  assert.deepEqual(tools.map((t) => t.name), ["a", "b", "c", "d"]);
  assert.deepEqual(server.received.filter((r) => r.method === "tools/list").map((r) => r.params), [{}, { cursor: "p2" }, { cursor: "p3" }]);
});

test("a server that never stops paginating is cut off", async () => {
  let n = 0;
  const { transport } = fake((m) => (m === "initialize" ? init() : { tools: [tool(`t${n}`)], nextCursor: `c${++n}` }));
  await assert.rejects(listAllTools(await connect(transport), 3), { message: "more than 3 pages of tools" });
  assert.equal(n, 3);
});

test("tool errors are outcomes; JSON-RPC errors, which some servers still send, are thrown", async () => {
  const { transport, server } = fake((m, params) => {
    if (m === "initialize") return init();
    if (params?.name === "missing") return { error: { code: -32602, message: "Unknown tool: missing" } };
    if (params?.name === "fails") return { content: [{ type: "text", text: "rates service down" }], isError: true };
    return { content: [{ type: "text", text: "40 GBP" }, { type: "image", data: "", mimeType: "image/png" }, { type: "text", text: "rate 0.8" }], structuredContent: { gbp: 40 } };
  });
  const session = await connect(transport);
  assert.deepEqual(await callTool(session, "convert", { amount: 50 }), { ok: true, text: "40 GBP\nrate 0.8", structured: { gbp: 40 } });
  assert.deepEqual(server.received.at(-1), { method: "tools/call", params: { name: "convert", arguments: { amount: 50 } } });
  assert.deepEqual(await callTool(session, "fails", {}), { ok: false, text: "rates service down" });
  await assert.rejects(callTool(session, "missing", {}), (error) => error instanceof RpcError && error.code === -32602);
});

test("MCP tools become namespaced agent tools whose failures throw into the agent loop", async () => {
  const { transport, server } = fake((m, params) => {
    if (m === "initialize") return init();
    return params?.name === "get_policy" && (params.arguments as { id?: string }).id === "meals-01"
      ? { content: [{ type: "text", text: "Dinners capped at 60 GBP." }] }
      : { content: [{ type: "text", text: "Policy not found" }], isError: true };
  });
  const session = await connect(transport);
  const [agentTool] = toAgentTools(session, [{ name: "get_policy", inputSchema: { type: "object" } }], "policies");
  assert.equal(agentTool.name, "policies__get_policy");
  assert.equal(agentTool.description, "");
  assert.deepEqual(agentTool.inputSchema, { type: "object" });
  assert.equal(await agentTool.run({ id: "meals-01" }), "Dinners capped at 60 GBP.");
  assert.deepEqual(server.received.at(-1)?.params, { name: "get_policy", arguments: { id: "meals-01" } }, "the server sees its own tool name");
  await assert.rejects(agentTool.run({ id: "x" }), { message: "Policy not found" });
  assert.throws(() => toAgentTools(session, [tool("x".repeat(60))], "policies"), { message: /^tool name not accepted by model APIs: policies__x+$/ });
  assert.throws(() => toAgentTools(session, [tool("docs.search")], "kb"), { message: "tool name not accepted by model APIs: kb__docs.search" });
});

test("an empty-string cursor is a cursor, not the end of the list", async () => {
  const { transport, server } = fake((m, params) => {
    if (m === "initialize") return init();
    return params && "cursor" in params ? { tools: [tool("b")] } : { tools: [tool("a")], nextCursor: "" };
  });
  assert.deepEqual((await listAllTools(await connect(transport))).map((t) => t.name), ["a", "b"]);
  assert.deepEqual(server.received.filter((r) => r.method === "tools/list").map((r) => r.params), [{}, { cursor: "" }]);
});

test("a null nextCursor, which the spec does not allow, ends the list instead of being sent back", async () => {
  const { transport, server } = fake((m) => (m === "initialize" ? init() : { tools: [tool("a")], nextCursor: null }));
  assert.deepEqual((await listAllTools(await connect(transport))).map((t) => t.name), ["a"]);
  assert.equal(server.received.filter((r) => r.method === "tools/list").length, 1);
});

test("interoperates with a real SDK server", async () => {
  const server = new McpServer({ name: "fx-server", version: "2.0.0" });
  server.registerTool(
    "convert_currency",
    { description: "Convert USD to GBP at a fixed demo rate.", inputSchema: { amount: z.number().positive().describe("USD amount") } },
    async ({ amount }) => ({ content: [{ type: "text", text: `${amount * 0.8} GBP` }] }),
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const session = await connect(clientTransport);
  assert.ok(SUPPORTED_VERSIONS.includes(session.protocolVersion));
  assert.deepEqual(session.serverInfo, { name: "fx-server", version: "2.0.0" });
  assert.equal(supports(session, "tools"), true);
  const tools = await listAllTools(session);
  assert.deepEqual(tools.map((t) => t.name), ["convert_currency"]);
  assert.deepEqual(await callTool(session, "convert_currency", { amount: 50 }), { ok: true, text: "40 GBP" });
  const invalid = await callTool(session, "convert_currency", { amount: -5 });
  assert.equal(invalid.ok, false, "input validation failures are tool execution errors (MCP 2025-11-25)");
  const unknown = await callTool(session, "nope", {});
  assert.equal(unknown.ok, false, "SDK 1.32.2 also returns an unknown tool as an isError result");
  assert.match(unknown.text, /nope not found/);
});
