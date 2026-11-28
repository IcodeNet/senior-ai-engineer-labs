import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { SEARCH_API, azureHttp, fakeEnv, fakeHttp, live } from "./azure.ts";
import { NORTHBANK_DOCUMENTS, governanceFilter, northbankIndex, type IndexDefinition } from "./northbank.ts";
import {
  HNSW_DEFAULTS,
  embedTexts,
  hnswAlgorithm,
  northbankVectorIndex,
  recallAtK,
  searchVectors,
  validateVectorIndex,
  vectorField,
  vectorMergeActions,
  vectorQuery,
} from "./index.ts";

const messages = (index: IndexDefinition) => validateVectorIndex(index).map((p) => p.message);
const edit = (change: (d: IndexDefinition) => void) => {
  const d = structuredClone(northbankVectorIndex(1536));
  change(d);
  return d;
};

describe("HNSW configuration", () => {
  test("defaults are m 4, efConstruction 400, efSearch 500 and cosine, as documented", () => {
    assert.deepEqual(HNSW_DEFAULTS, { m: 4, efConstruction: 400, efSearch: 500, metric: "cosine" });
    assert.deepEqual(hnswAlgorithm("h"), { name: "h", kind: "hnsw", hnswParameters: { m: 4, efConstruction: 400, efSearch: 500, metric: "cosine" } });
    assert.deepEqual(hnswAlgorithm("h", { m: 10, efSearch: 1000, metric: "dotProduct" }).hnswParameters, { m: 10, efConstruction: 400, efSearch: 1000, metric: "dotProduct" });
  });

  test("parameters outside the documented ranges are rejected", () => {
    assert.throws(() => hnswAlgorithm("h", { m: 3 }), /m must be an integer from 4 to 10, got 3/);
    assert.throws(() => hnswAlgorithm("h", { m: 11 }), RangeError);
    assert.throws(() => hnswAlgorithm("h", { efConstruction: 99 }), /efConstruction must be an integer from 100 to 1000/);
    assert.throws(() => hnswAlgorithm("h", { efSearch: 1001 }), /efSearch/);
    assert.throws(() => hnswAlgorithm("h", { metric: "manhattan" as never }), /unknown metric manhattan/);
  });
});

describe("vector fields", () => {
  test("searchable, not retrievable, with dimensions and a profile; never filterable, sortable or facetable", () => {
    assert.deepEqual(vectorField("v", 1536, "p"), { name: "v", type: "Collection(Edm.Single)", searchable: true, retrievable: false, dimensions: 1536, vectorSearchProfile: "p" });
    assert.throws(() => vectorField("v", 0, "p"), RangeError);
    assert.throws(() => vectorField("v", 4097, "p"), /dimensions must be 1–4096/);
    assert.equal(vectorField("v", 4096, "p").dimensions, 4096);
  });

  test("the Northbank vector index has an HNSW profile for queries and an exhaustive one for exact comparisons", () => {
    const index = northbankVectorIndex(1536);
    assert.deepEqual(validateVectorIndex(index), []);
    assert.deepEqual(index.vectorSearch!.algorithms.map((a) => a.kind), ["hnsw", "exhaustiveKnn"]);
    assert.deepEqual(index.vectorSearch!.profiles.map((p) => [p.name, p.algorithm]), [["northbank-vector-profile", "northbank-hnsw"], ["northbank-exact-profile", "northbank-exact"]]);
    assert.equal(index.fields.find((f) => f.name === "contentVector")!.vectorSearchProfile, "northbank-vector-profile");
    assert.equal(index.name, northbankIndex(1536).name, "same index as step 18: adding algorithms and profiles is an in-place update");
  });
});

describe("validating the vector configuration", () => {
  test("broken references are caught", () => {
    assert.deepEqual(messages(edit((d) => (d.vectorSearch!.profiles[0].algorithm = "missing"))), ["profile northbank-vector-profile uses unknown algorithm missing"]);
    assert.deepEqual(messages(edit((d) => (d.vectorSearch!.profiles[0].vectorizer = "openai"))), ["profile northbank-vector-profile uses unknown vectorizer openai"]);
    assert.deepEqual(messages(edit((d) => (d.vectorSearch!.profiles[0].compression = "sq"))), ["profile northbank-vector-profile uses unknown compression sq"]);
    assert.deepEqual(messages(edit((d) => (d.fields.find((f) => f.name === "contentVector")!.vectorSearchProfile = "nope"))), ["vector field needs a declared profile, got nope"]);
    assert.deepEqual(messages(edit((d) => d.vectorSearch!.algorithms.push({ name: "northbank-hnsw", kind: "hnsw" }))), ["duplicate algorithms name northbank-hnsw"]);
  });

  test("vector field attributes, dimensions and algorithm parameters are checked", () => {
    const vector = (d: IndexDefinition) => d.fields.find((f) => f.name === "contentVector")!;
    assert.deepEqual(messages(edit((d) => (vector(d).filterable = true))), ["a vector field cannot be filterable"]);
    assert.deepEqual(messages(edit((d) => (vector(d).searchable = false))), ["a vector field must be searchable"]);
    assert.deepEqual(messages(edit((d) => (vector(d).dimensions = 5000))), ["dimensions must be 1–4096"]);
    assert.deepEqual(messages(edit((d) => (d.vectorSearch!.algorithms[0].hnswParameters = { m: 20 }))), ["m must be an integer from 4 to 10, got 20"]);
    assert.deepEqual(messages(edit((d) => (d.vectorSearch!.algorithms[1].kind = "ivf"))), ["unknown algorithm kind ivf"]);
  });
});

describe("approximate versus exact", () => {
  test("recall@k is the share of the exact top k that the approximation found", () => {
    assert.equal(recallAtK(["a", "b", "c"], ["a", "b", "c"], 3), 1);
    assert.equal(recallAtK(["a", "x", "c", "b"], ["a", "b", "c"], 3), 2 / 3);
    assert.equal(recallAtK(["x", "y"], ["a", "b"], 2), 0);
    assert.throws(() => recallAtK(["a"], [], 3), RangeError);
  });
});

describe("embedding and loading vectors", () => {
  const vec = (n: number) => [n, 0, 0, 0];

  test("embeds in batches with an Entra ID token, restoring input order", async () => {
    const { http, requests } = fakeHttp((r) => {
      const input = (r.body as { input: string[] }).input;
      return { status: 200, body: { data: input.map((_, i) => ({ index: i, embedding: vec(i) })).reverse() } };
    });
    assert.deepEqual(await embedTexts(http, fakeEnv, ["a", "b", "c"], 2), [vec(0), vec(1), vec(0)]);
    assert.deepEqual(requests.map((r) => [r.method, r.url, r.audience, (r.body as { model: string }).model]), [
      ["POST", "https://oai-test.openai.azure.com/openai/v1/embeddings", "openai", "embed"],
      ["POST", "https://oai-test.openai.azure.com/openai/v1/embeddings", "openai", "embed"],
    ]);
  });

  test("a wrong count or the wrong dimensions stop the load before anything is written", async () => {
    await assert.rejects(embedTexts(fakeHttp(() => ({ status: 200, body: { data: [] } })).http, fakeEnv, ["a"]), /returned 0 vectors for 1 inputs/);
    await assert.rejects(embedTexts(fakeHttp(() => ({ status: 200, body: { data: [{ index: 0, embedding: [1, 2] }] } })).http, fakeEnv, ["a"]), /has 2 dimensions, index expects 4/);
    await assert.rejects(embedTexts(fakeHttp(() => ({ status: 429, body: { error: { message: "Rate limit" } } })).http, fakeEnv, ["a"]), /embedding failed: 429 Rate limit/);
  });

  test("vectors are merged into existing documents, touching nothing else", () => {
    const docs = NORTHBANK_DOCUMENTS.slice(0, 2);
    assert.deepEqual(vectorMergeActions(docs, [vec(1), vec(2)]), [
      { "@search.action": "merge", id: docs[0].id, contentVector: vec(1) },
      { "@search.action": "merge", id: docs[1].id, contentVector: vec(2) },
    ]);
    assert.throws(() => vectorMergeActions(docs, [vec(1)]), RangeError);
  });

  test("a vector query is governed, selects no vectors and can ask for exact KNN", async () => {
    const request = vectorQuery(vec(1), 3, "2026-11-28", true);
    assert.deepEqual(request, {
      vectorQueries: [{ kind: "vector", vector: vec(1), fields: "contentVector", k: 3, exhaustive: true }],
      filter: governanceFilter("2026-11-28"),
      select: "id,title,chunk,sourceUri,status",
      top: 3,
    });
    assert.throws(() => vectorQuery(vec(1), 0, "2026-11-28"), RangeError);
    const { http, requests } = fakeHttp(() => ({ status: 200, body: { value: [{ id: "k", sourceUri: "u", "@search.score": 0.9 }] } }));
    assert.deepEqual(await searchVectors(http, "https://s", "northbank-faq-v1", request), [{ id: "k", sourceUri: "u", score: 0.9 }]);
    assert.equal(requests[0].url, `https://s/indexes/northbank-faq-v1/docs/search?api-version=${SEARCH_API}`);
  });
});

describe.runIf(live)("live: real embeddings in the Northbank index", () => {
  test("a paraphrase finds the right chunk, and HNSW agrees with exact KNN on this corpus", { timeout: 180_000 }, async () => {
    const env = live!;
    const index = northbankVectorIndex(env.dimensions);
    const url = (path = "") => `${env.searchEndpoint}/indexes/${index.name}${path}?api-version=${SEARCH_API}`;
    const put = await azureHttp({ method: "PUT", url: url(), body: index, audience: "search" });
    assert.ok([200, 201].includes(put.status), JSON.stringify(put.body));
    assert.equal((await azureHttp({ method: "POST", url: url("/docs/index"), body: { value: NORTHBANK_DOCUMENTS }, audience: "search" })).status, 200);
    const vectors = await embedTexts(azureHttp, env, NORTHBANK_DOCUMENTS.map((d) => `${d.title}\n${d.chunk}`));
    const merged = await azureHttp({ method: "POST", url: url("/docs/index"), body: { value: vectorMergeActions(NORTHBANK_DOCUMENTS, vectors) }, audience: "search" });
    assert.equal(merged.status, 200, JSON.stringify(merged.body));
    const [query] = await embedTexts(azureHttp, env, ["Am I charged if a payment would take me over my overdraft limit?"]);
    let approximate: { id: string; sourceUri: string }[] = [];
    for (let i = 0; i < 15 && !approximate.length; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1000));
      approximate = await searchVectors(azureHttp, env.searchEndpoint, index.name, vectorQuery(query, 3, "2026-11-28"));
    }
    const exact = await searchVectors(azureHttp, env.searchEndpoint, index.name, vectorQuery(query, 3, "2026-11-28", true));
    assert.match(approximate[0].sourceUri, /overdraft-fees$/);
    assert.equal(recallAtK(approximate.map((h) => h.id), exact.map((h) => h.id), 3), 1);
  });
});
