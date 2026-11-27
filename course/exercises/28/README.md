# 28 · An MCP client: handshake and capability negotiation

## Why it matters
SDK clients hide the protocol, which is fine until a server misbehaves, a host rejects a server, or an interviewer asks what actually happens on connect. This step writes the client side by hand over raw JSON-RPC (`rpc.ts` handles message IDs and responses), so you see every message.

**The lifecycle.**

1. Client → `initialize` with the newest `protocolVersion` it supports, its own `capabilities` and `clientInfo`.
2. Server → its chosen `protocolVersion` (the same if it supports it, otherwise one it does), its `capabilities`, `serverInfo` and optional `instructions`.
3. If the client does not support the server's version it **disconnects** — never "try anyway".
4. Client → `notifications/initialized` (a notification: no `id`, no response). Only then normal requests.

**Capabilities are a contract.** A server that did not declare `tools` must not be sent `tools/list`; check before you ask rather than handling `-32601 Method not found` afterwards. Sub-flags such as `listChanged` or `subscribe` say which notifications to expect.

**Two kinds of failure.** A JSON-RPC `error` (unknown tool, invalid params) is a protocol failure: throw it to your code. A result with `isError: true` is a **tool** failure that the model should see and react to (step 23). Mixing them up either crashes the agent or hides bugs.

**Lists are paginated** with `nextCursor`; follow it, but cap the pages — a buggy or hostile server can paginate forever.

**Hosts combine servers.** Two servers can both offer `search`; prefix tool names with the server (`policies__search`), and remember that a third-party server's descriptions and outputs are untrusted input to your model.

Tests run against a scripted fake server **and** a real SDK `McpServer`, both over `InMemoryTransport`.

## Interview question
> Your host connects to ten MCP servers maintained by different teams. One upgrade adds a tool called `send_email` to a "read-only" server. What should the host do at connect time and at call time?

Think about: allow-lists of tools per server, pinning server versions, diffing tool lists (`listChanged`), annotations as untrusted hints, namespacing, approval gates for side effects (step 26), and logging which server produced which output.

## Your task
Implement in `index.ts` (types, `CLIENT_INFO` and `SUPPORTED_VERSIONS` are provided):

- `connect(transport)` → create an `RpcConnection`, `await rpc.start()`, request `initialize` with `{ protocolVersion: SUPPORTED_VERSIONS[0], capabilities: {}, clientInfo: CLIENT_INFO }`. If the returned version is not in `SUPPORTED_VERSIONS`, `await rpc.close()` and throw `unsupported protocol version: <v>`. Otherwise notify `notifications/initialized` and return `{ rpc, protocolVersion, serverInfo, capabilities (default {}), instructions? }`.
- `supports(session, capability)` → whether the server declared it.
- `listAllTools(session, maxPages = 10)` → throw `server does not support tools` if undeclared; request `tools/list` with `{}` then `{ cursor }` while `nextCursor` is set; return all tools; after `maxPages` requests that still have a `nextCursor`, throw `more than <maxPages> pages of tools`.
- `callTool(session, name, args)` → same capability check; request `tools/call` with `{ name, arguments: args }`; return `{ ok: !isError, text, structured? }` where `text` joins the `text` parts with `\n` (other part types skipped) and `structured` is `structuredContent` when present. JSON-RPC errors propagate as `RpcError`.
- `toAgentTools(session, tools, prefix)` → step 23 tools named `<prefix>__<name>`, `description` defaulting to `""`, the same `inputSchema`, and `run(args)` that calls the **original** tool name and returns `text`, or throws `Error(text)` when `ok` is false.

## Going further
Handle `notifications/tools/list_changed` by refreshing the tool list, send `notifications/cancelled` on timeouts, implement `ping`, and compare your client with the SDK's `Client` — it does the same handshake plus request timeouts, progress and server-to-client requests (sampling, elicitation).
