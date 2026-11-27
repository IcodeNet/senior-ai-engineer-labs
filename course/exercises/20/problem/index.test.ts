import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { azureHttp, fakeEnv, fakeHttp, live } from "./azure.ts";
import { chunks } from "./corpus.ts";
import { createOrUpdateIndex, embedTexts, indexDefinition, toIndexActions, uploadDocuments } from "./indexing.ts";
import { answerQuestion, type SearchProvider } from "./pipeline.ts";
import { buildSearchRequest, searchIndex, type Hit } from "./retrieval.ts";
import { chatComplete, toCandidates } from "./index.ts";

const prompt = { system: "rules", user: "Question: q" };
const reply = (body: unknown, status = 200) => fakeHttp(() => ({ status, body }));

describe("chat completions", () => {
  test("calls the v1 endpoint with system and user messages and reports token usage", async () => {
    const { http, requests } = reply({ choices: [{ finish_reason: "stop", message: { content: "Economy only [S1]." } }], usage: { prompt_tokens: 120, completion_tokens: 30 } });
    assert.deepEqual(await chatComplete(http, fakeEnv, prompt, 500), { text: "Economy only [S1].", inputTokens: 120, outputTokens: 30 });
    assert.deepEqual(requests[0], {
      method: "POST",
      url: "https://oai-test.openai.azure.com/openai/v1/chat/completions",
      body: { model: "chat", messages: [{ role: "system", content: "rules" }, { role: "user", content: "Question: q" }], max_completion_tokens: 500 },
      audience: "openai",
    });
  });

  test("content filtering, empty answers and HTTP errors are failures, not answers", async () => {
    await assert.rejects(chatComplete(reply({ choices: [{ finish_reason: "content_filter", message: { content: "" } }] }).http, fakeEnv, prompt), { message: "answer blocked by the content filter" });
    await assert.rejects(chatComplete(reply({ choices: [{ finish_reason: "length", message: { content: "" } }] }).http, fakeEnv, prompt), { message: "empty answer (finish_reason: length)" });
    await assert.rejects(chatComplete(reply({ error: { message: "Unauthorized" } }, 401).http, fakeEnv, prompt), { message: "chat failed: 401 Unauthorized" });
  });
});

test("hits become pipeline candidates keyed by chunk ID, keeping governance fields", () => {
  const hits: Hit[] = [{ id: "k", chunkId: "travel@2#0", title: "Travel policy", content: "Economy.", status: "approved", effectiveDate: "2026-01-01T00:00:00Z", score: 2.5 }];
  assert.deepEqual(toCandidates(hits), [{ id: "travel@2#0", title: "Travel policy", text: "Economy.", score: 2.5, status: "approved", effectiveDate: "2026-01-01T00:00:00Z" }]);
});

describe.runIf(live)("live: grounded answer from Azure", () => {
  test("answers with citations from approved policy only", { timeout: 180_000 }, async () => {
    const env = live!;
    await createOrUpdateIndex(azureHttp, env.searchEndpoint, indexDefinition(env.indexName, env.dimensions));
    await uploadDocuments(azureHttp, env.searchEndpoint, env.indexName, toIndexActions(chunks, await embedTexts(azureHttp, env, chunks.map((c) => `${c.title}\n${c.content}`))));
    await new Promise((r) => setTimeout(r, 3000));
    let tokens = 0;
    const provider: SearchProvider = {
      async search(query, { top, now }) {
        const [vector] = await embedTexts(azureHttp, env, [query]);
        return toCandidates(await searchIndex(azureHttp, env.searchEndpoint, env.indexName, buildSearchRequest("semantic", query, vector, { top, now })));
      },
    };
    const result = await answerQuestion("Can I fly business class to New York?", {
      provider,
      llm: async (p) => {
        const completion = await chatComplete(azureHttp, env, p);
        tokens += completion.inputTokens + completion.outputTokens;
        return completion.text;
      },
      now: new Date(),
    });
    console.log(JSON.stringify(result, null, 2), `\ntokens used: ${tokens}`);
    assert.equal(result.kind, "answer");
    if (result.kind === "answer") assert.ok(result.citations.every((c) => !c.chunkId.startsWith("travel@3") && !c.chunkId.startsWith("travel@1")));
  });
});
