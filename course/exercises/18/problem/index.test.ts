import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { SEARCH_API, azureHttp, fakeEnv, fakeHttp, live } from "./azure.ts";
import { chunks } from "./corpus.ts";
import { createOrUpdateIndex, indexDefinition } from "./indexing.ts";
import { documentKey, embedTexts, toIndexActions, uploadDocuments } from "./index.ts";

const vectorsFor = (texts: string[], dims = 4) => texts.map((_, i) => Array.from({ length: dims }, (_, d) => i + d / 10));

test("document keys are valid Azure AI Search keys and reversible", () => {
  for (const chunk of chunks) {
    const key = documentKey(chunk.id);
    assert.match(key, /^[A-Za-z0-9_\-=]+$/);
    assert.equal(Buffer.from(key, "base64url").toString("utf8"), chunk.id);
  }
  assert.notEqual(documentKey("a#1"), documentKey("a@1"));
});

describe("embeddings", () => {
  test("batches inputs, keeps order and calls the v1 endpoint with the deployment", async () => {
    const { http, requests } = fakeHttp((request) => {
      const input = (request.body as { input: string[] }).input;
      const data = vectorsFor(input).map((embedding, index) => ({ index, embedding })).reverse();
      return { status: 200, body: { data } };
    });
    const texts = ["a", "b", "c", "d", "e"];
    const vectors = await embedTexts(http, fakeEnv, texts, 2);
    assert.equal(requests.length, 3);
    assert.deepEqual(requests[0], {
      method: "POST",
      url: "https://oai-test.openai.azure.com/openai/v1/embeddings",
      body: { model: "embed", input: ["a", "b"] },
      audience: "openai",
    });
    assert.deepEqual(vectors.map((v) => v[0]), [0, 1, 0, 1, 0], "vectors follow input order within each batch");
  });

  test("wrong dimensions, missing vectors and HTTP errors fail loudly", async () => {
    const wrongDims = fakeHttp(() => ({ status: 200, body: { data: [{ index: 0, embedding: [1, 2] }] } }));
    await assert.rejects(embedTexts(wrongDims.http, fakeEnv, ["a"]), { message: "embedding has 2 dimensions, index expects 4" });
    const short = fakeHttp(() => ({ status: 200, body: { data: [] } }));
    await assert.rejects(embedTexts(short.http, fakeEnv, ["a"]), { message: "embedding returned 0 vectors for 1 inputs" });
    const throttled = fakeHttp(() => ({ status: 429, body: { error: { message: "Rate limit" } } }));
    await assert.rejects(embedTexts(throttled.http, fakeEnv, ["a"]), { message: "embedding failed: 429 Rate limit" });
  });
});

describe("index actions and upload", () => {
  test("every chunk becomes a mergeOrUpload action; only the highest approved version is latest", () => {
    const { value } = toIndexActions(chunks, vectorsFor(chunks.map((c) => c.content)));
    assert.equal(value.length, chunks.length);
    const latest = (id: string) => value.find((a) => a.id === documentKey(id))?.isLatest;
    assert.equal(latest("travel@2#0"), true);
    assert.equal(latest("travel@1#0"), false, "superseded version");
    assert.equal(latest("travel@3#0"), false, "drafts are never latest");
    assert.equal(latest("remote@1#0"), false, "revoked");
    assert.equal(latest("remote@2#0"), true);
    assert.ok(value.every((a) => a["@search.action"] === "mergeOrUpload" && a.contentVector.length === 4));
    assert.throws(() => toIndexActions(chunks, []), RangeError);
  });

  test("uploads to the docs/index endpoint and reports partial failures (207)", async () => {
    const actions = toIndexActions(chunks.slice(0, 2), vectorsFor(["a", "b"]));
    const ok = fakeHttp(() => ({ status: 200, body: { value: actions.value.map((a) => ({ key: a.id, status: true })) } }));
    assert.equal(await uploadDocuments(ok.http, "https://s", "policies", actions), 2);
    assert.equal(ok.requests[0].url, `https://s/indexes/policies/docs/index?api-version=${SEARCH_API}`);
    assert.equal(ok.requests[0].method, "POST");
    const partial = fakeHttp(() => ({
      status: 207,
      body: { value: [{ key: actions.value[0].id, status: true }, { key: actions.value[1].id, status: false, errorMessage: "Invalid vector" }] },
    }));
    await assert.rejects(uploadDocuments(partial.http, "https://s", "policies", actions), { message: `indexing failed for ${actions.value[1].id}: Invalid vector` });
  });
});

describe.runIf(live)("live: embed and index the corpus", () => {
  test("uploads every chunk with a real embedding", { timeout: 120_000 }, async () => {
    const env = live!;
    await createOrUpdateIndex(azureHttp, env.searchEndpoint, indexDefinition(env.indexName, env.dimensions));
    const vectors = await embedTexts(azureHttp, env, chunks.map((c) => `${c.title}\n${c.content}`));
    assert.equal(await uploadDocuments(azureHttp, env.searchEndpoint, env.indexName, toIndexActions(chunks, vectors)), chunks.length);
    let count = 0;
    for (let i = 0; i < 20 && count < chunks.length; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      count = Number((await azureHttp({ method: "GET", url: `${env.searchEndpoint}/indexes/${env.indexName}/docs/$count?api-version=${SEARCH_API}`, audience: "search" })).body);
    }
    assert.equal(count, chunks.length);
  });
});
