import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { SEARCH_API, azureHttp, fakeHttp, live } from "./azure.ts";
import { chunks } from "./corpus.ts";
import { createOrUpdateIndex, embedTexts, indexDefinition, toIndexActions, uploadDocuments } from "./indexing.ts";
import { approvalFilter, buildSearchRequest, searchIndex, type Mode } from "./index.ts";

const now = new Date("2026-11-27T12:00:00Z");
const vector = [0.1, 0.2, 0.3, 0.4];

test("the approval filter is built by the backend from the clock, never from user input", () => {
  assert.equal(approvalFilter(now), "status eq 'approved' and isLatest eq true and effectiveDate le 2026-11-27T12:00:00.000Z");
});

describe("search requests", () => {
  const base = () => ({ top: 5, filter: approvalFilter(now), select: "id,docId,title,content,status,effectiveDate" });
  const vectorQuery = { kind: "vector", vector, k: 5, fields: "contentVector" };

  test("keyword uses BM25 text search only", () => {
    assert.deepEqual(buildSearchRequest("keyword", "ERR-4021", undefined, { top: 5, now }), { ...base(), search: "ERR-4021" });
  });
  test("vector uses only the query vector", () => {
    assert.deepEqual(buildSearchRequest("vector", "ignored", vector, { top: 5, now }), { ...base(), vectorQueries: [vectorQuery] });
  });
  test("hybrid sends both, fused by RRF in the service", () => {
    assert.deepEqual(buildSearchRequest("hybrid", "hotel limit", vector, { top: 5, now }), { ...base(), search: "hotel limit", vectorQueries: [vectorQuery] });
  });
  test("semantic adds the semantic reranker on top of hybrid", () => {
    assert.deepEqual(buildSearchRequest("semantic", "hotel limit", vector, { top: 5, now }), {
      ...base(),
      search: "hotel limit",
      vectorQueries: [vectorQuery],
      queryType: "semantic",
      semanticConfiguration: "default",
    });
  });
  test("vector modes require a vector", () => {
    for (const mode of ["vector", "hybrid", "semantic"] as Mode[]) assert.throws(() => buildSearchRequest(mode, "q", undefined, { top: 5, now }), { message: `${mode} search needs a query vector` });
  });
});

test("search results map back to chunk IDs and prefer the reranker score", async () => {
  const key = Buffer.from("travel@2#0").toString("base64url");
  const { http, requests } = fakeHttp(() => ({
    status: 200,
    body: { value: [{ id: key, title: "Travel policy", content: "Economy.", status: "approved", effectiveDate: "2026-01-01T00:00:00Z", "@search.score": 0.03, "@search.rerankerScore": 2.7 }, { id: key, title: "t", content: "c", status: "approved", effectiveDate: "x", "@search.score": 0.02 }] },
  }));
  const hits = await searchIndex(http, "https://s", "policies", { search: "x" });
  assert.equal(requests[0].url, `https://s/indexes/policies/docs/search?api-version=${SEARCH_API}`);
  assert.equal(requests[0].method, "POST");
  assert.deepEqual(hits[0], { id: key, chunkId: "travel@2#0", title: "Travel policy", content: "Economy.", status: "approved", effectiveDate: "2026-01-01T00:00:00Z", score: 2.7 });
  assert.equal(hits[1].score, 0.02);
  const failing = fakeHttp(() => ({ status: 400, body: { error: { message: "Invalid expression" } } }));
  await assert.rejects(searchIndex(failing.http, "https://s", "p", {}), { message: "search failed: 400 Invalid expression" });
});

describe.runIf(live)("live: four ways to search", () => {
  test("every mode returns only approved, latest, effective chunks", { timeout: 180_000 }, async () => {
    const env = live!;
    await createOrUpdateIndex(azureHttp, env.searchEndpoint, indexDefinition(env.indexName, env.dimensions));
    const vectors = await embedTexts(azureHttp, env, chunks.map((c) => `${c.title}\n${c.content}`));
    await uploadDocuments(azureHttp, env.searchEndpoint, env.indexName, toIndexActions(chunks, vectors));
    await new Promise((r) => setTimeout(r, 3000));
    const query = "Can I fly business class?";
    const [queryVector] = await embedTexts(azureHttp, env, [query]);
    for (const mode of ["keyword", "vector", "hybrid", "semantic"] as Mode[]) {
      const hits = await searchIndex(azureHttp, env.searchEndpoint, env.indexName, buildSearchRequest(mode, query, queryVector, { top: 5, now: new Date() }));
      console.log(`${mode}: ${hits.map((h) => `${h.chunkId} (${h.score.toFixed(3)})`).join(", ")}`);
      assert.ok(hits.length > 0, `${mode} returned nothing`);
      assert.ok(hits.every((h) => h.status === "approved"), `${mode} returned an unapproved chunk`);
      assert.ok(!hits.some((h) => ["travel@1#0", "travel@3#0", "remote@1#0"].includes(h.chunkId)), `${mode} leaked a superseded, draft or revoked chunk`);
    }
  });
});
