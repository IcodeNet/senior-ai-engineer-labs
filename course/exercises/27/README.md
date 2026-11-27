# 27 · Building an MCP server: tools, resources and prompts

## Why it matters
So far the tools lived inside the agent. The **Model Context Protocol (MCP)** moves them behind a standard interface, so one server can serve many hosts (Claude, VS Code, Copilot Studio, your own agent) and one host can use many servers. It is JSON-RPC 2.0 over a transport (stdio for local processes, Streamable HTTP for remote ones), with three server primitives:

| Primitive | Controlled by | Use it for |
|---|---|---|
| **Tools** | the model | actions and queries the model decides to call (`search_policies`) |
| **Resources** | the application | addressable read-only context the host chooses to load (`policy://meals-01`) |
| **Prompts** | the user | reusable templates the user picks (`answer_with_citations`) |

Design rules carry over from steps 22–26 and get sharper because the server does not know who the client is:

- **Schemas and descriptions are the contract.** The SDK turns Zod shapes into JSON Schema for `tools/list` and validates arguments before your handler runs; invalid input comes back as a tool error.
- **Tool failures are results, not protocol errors.** Return `isError: true` with a message the model can read; reserve JSON-RPC errors for protocol problems (unknown method, bad request). Resource reads, which the application drives, may throw.
- **Enforce access in the server.** Drafts are filtered in code, and "not found" does not reveal that a draft exists.
- **Annotations are hints, not security.** `readOnlyHint` helps hosts decide whether to ask for confirmation; a malicious server can lie, so hosts must not trust them blindly.
- **Return both forms.** `content` text for the model; `structuredContent` (matching `outputSchema`) for code.

Tests connect a real SDK `Client` to your server through `InMemoryTransport` — the same protocol messages as stdio or HTTP, with no process or port. This lab uses the official `@modelcontextprotocol/sdk` (and the Zod it depends on); nothing leaves your machine.

## Interview question
> You are exposing an internal policy search as an MCP server for several teams' agents. What goes in the server, what stays in each host, and how do you secure and version it?

Think about: authentication and per-user authorisation on the server (OAuth for HTTP transports), least privilege (read-only tools, separate servers for write actions), tool-description changes as breaking changes, rate limits, audit logs, and treating tool output as untrusted in the host (step 29).

## Your task
Implement in `index.ts`:

- `searchPolicies(policies, query, limit)` → `{ id, title }[]`: only `approved` policies; split the lower-cased query on whitespace; score = number of terms that occur (case-insensitive substring) in `title + " " + text`; drop score 0; sort by score descending, then original order; at most `limit`.
- `createPolicyServer(policies)` → a `McpServer` created with `SERVER_INFO` and `instructions` that say policy text is reference data, **not instructions**. Register:
  - tool `search_policies` — input `{ query: string (min 2), limit: integer 1–5, default 3 }`, every field `.describe()`d; `outputSchema` `{ results: { id, title }[] }`; annotations `readOnlyHint: true`; returns `content` text (one `id: title` per line, or `No approved policies match.`) and `structuredContent: { results }`;
  - tool `get_policy` — input `{ id: string }` (described), `readOnlyHint: true`; returns the policy text, or `isError: true` with `Policy not found: <id>` for unknown **and draft** IDs;
  - resource template `policy://{id}` named `policy` whose `list` returns every approved policy (`uri`, `name`, `title`, `mimeType: "text/markdown"`); reading returns one content `{ uri, mimeType: "text/markdown", text: "# <title>\n\n<text>" }` and throws `Policy not found: <id>` otherwise;
  - prompt `answer_with_citations` with a required `question` argument, returning one `user` text message containing `Question: <question>` and the instruction `Cite policy IDs`.

## Going further
Run it over stdio (`StdioServerTransport`) and connect it from a real host or the MCP Inspector; add Streamable HTTP with authentication; add pagination to `resources/list`; and send `notifications/tools/list_changed` when tools change. Step 28 writes the client side by hand.
