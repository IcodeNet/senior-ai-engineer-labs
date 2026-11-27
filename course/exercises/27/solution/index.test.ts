import { test } from "vitest";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { SERVER_INFO, createPolicyServer, searchPolicies, type Policy } from "./index.ts";

const policies: Policy[] = [
  { id: "travel-01", title: "Travel policy", text: "Book economy class for flights under 6 hours. Hotels in London are capped at 180 GBP per night.", status: "approved" },
  { id: "meals-01", title: "Meals policy", text: "Client dinners are capped at 60 GBP per person. Alcohol is not reimbursed.", status: "approved" },
  { id: "travel-02", title: "Travel policy (draft)", text: "Business class for all flights. Hotels uncapped.", status: "draft" },
  { id: "gifts-01", title: "Gifts and hospitality", text: "Register gifts above 50 GBP. Never accept cash. Hotels offered by vendors must be declined.", status: "approved" },
];

async function connected(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createPolicyServer(policies).connect(serverTransport);
  const client = new Client({ name: "lab-27-test", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

const text = (result: unknown): string =>
  ((result as { content: { type: string; text?: string }[] }).content).map((part) => part.text ?? "").join("\n");

test("search ranks approved policies by matching terms and never returns drafts", () => {
  assert.deepEqual(searchPolicies(policies, "hotels London", 5), [
    { id: "travel-01", title: "Travel policy" },
    { id: "gifts-01", title: "Gifts and hospitality" },
  ]);
  assert.deepEqual(searchPolicies(policies, "HOTELS", 1), [{ id: "travel-01", title: "Travel policy" }]);
  assert.deepEqual(searchPolicies(policies, "business class", 5), [{ id: "travel-01", title: "Travel policy" }]);
  assert.deepEqual(searchPolicies(policies, "yacht", 5), []);
});

test("initialize advertises server info, instructions and tools, resources and prompts", async () => {
  const client = await connected();
  assert.deepEqual(client.getServerVersion(), SERVER_INFO);
  const capabilities = client.getServerCapabilities() ?? {};
  for (const capability of ["tools", "resources", "prompts"]) assert.ok(capability in capabilities, `missing ${capability} capability`);
  assert.match(client.getInstructions() ?? "", /not instructions/);
});

test("tools are listed with JSON Schema inputs and read-only annotations", async () => {
  const { tools } = await (await connected()).listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ["get_policy", "search_policies"]);
  const search = tools.find((t) => t.name === "search_policies")!;
  assert.equal(search.inputSchema.type, "object");
  assert.deepEqual(search.inputSchema.required, ["query"]);
  const properties = search.inputSchema.properties as Record<string, { type?: string; description?: string }>;
  assert.equal(properties.query.type, "string");
  assert.ok(properties.query.description, "every argument is described for the model");
  assert.equal(properties.limit.type, "integer");
  assert.ok(search.outputSchema, "search declares its structured output");
  for (const tool of tools) assert.equal(tool.annotations?.readOnlyHint, true);
});

test("search_policies returns text for the model and structured content for code", async () => {
  const client = await connected();
  const result = await client.callTool({ name: "search_policies", arguments: { query: "hotels" } });
  assert.equal(result.isError, undefined);
  assert.equal(text(result), "travel-01: Travel policy\ngifts-01: Gifts and hospitality");
  assert.deepEqual(result.structuredContent, {
    results: [
      { id: "travel-01", title: "Travel policy" },
      { id: "gifts-01", title: "Gifts and hospitality" },
    ],
  });
  const none = await client.callTool({ name: "search_policies", arguments: { query: "yacht", limit: 2 } });
  assert.equal(text(none), "No approved policies match.");
  assert.deepEqual(none.structuredContent, { results: [] });
});

test("invalid arguments are rejected by the schema before the handler runs", async () => {
  const client = await connected();
  const result = await client.callTool({ name: "search_policies", arguments: { query: "x", limit: 50 } });
  assert.equal(result.isError, true);
  assert.match(text(result), /validation/i);
});

test("get_policy returns approved text and a tool error for drafts and unknown IDs, without leaking drafts", async () => {
  const client = await connected();
  assert.equal(text(await client.callTool({ name: "get_policy", arguments: { id: "meals-01" } })), policies[1].text);
  for (const id of ["travel-02", "nope"]) {
    const result = await client.callTool({ name: "get_policy", arguments: { id } });
    assert.equal(result.isError, true, "a tool failure is a result the model can see, not a protocol error");
    assert.equal(text(result), `Policy not found: ${id}`);
  }
});

test("approved policies are resources: listed via the template and readable as Markdown", async () => {
  const client = await connected();
  const { resourceTemplates } = await client.listResourceTemplates();
  assert.deepEqual(resourceTemplates.map((t) => t.uriTemplate), ["policy://{id}"]);
  const { resources } = await client.listResources();
  assert.deepEqual(resources.map((r) => r.uri), ["policy://travel-01", "policy://meals-01", "policy://gifts-01"]);
  const read = await client.readResource({ uri: "policy://meals-01" });
  assert.deepEqual(read.contents, [{ uri: "policy://meals-01", mimeType: "text/markdown", text: `# Meals policy\n\n${policies[1].text}` }]);
  await assert.rejects(client.readResource({ uri: "policy://travel-02" }), (error: { code?: number; message?: string }) => {
    assert.equal(error.code, -32002, "resource not found uses MCP's -32002, not a generic error");
    assert.match(error.message ?? "", /Policy not found: travel-02/);
    return true;
  });
});

test("the prompt template embeds the question and asks for citations", async () => {
  const client = await connected();
  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map((p) => p.name), ["answer_with_citations"]);
  assert.deepEqual(prompts[0].arguments?.map((a) => [a.name, a.required]), [["question", true]]);
  const prompt = await client.getPrompt({ name: "answer_with_citations", arguments: { question: "Can I expense wine?" } });
  assert.equal(prompt.messages.length, 1);
  assert.equal(prompt.messages[0].role, "user");
  const content = prompt.messages[0].content as { type: string; text: string };
  assert.match(content.text, /Question: Can I expense wine\?/);
  assert.match(content.text, /Cite policy IDs/);
});
