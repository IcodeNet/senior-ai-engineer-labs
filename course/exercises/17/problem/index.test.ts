import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { SEARCH_API, azureHttp, fakeHttp, live } from "./azure.ts";
import { createOrUpdateIndex, indexDefinition } from "./index.ts";

const field = (name: string) => indexDefinition("policies", 1536).fields.find((f) => f.name === name) as Record<string, unknown> | undefined;

describe("index definition", () => {
  test("has a string key and the governance fields as filters, not search text", () => {
    assert.deepEqual([field("id")?.key, field("id")?.type], [true, "Edm.String"]);
    for (const name of ["status", "isLatest", "effectiveDate", "version", "docId"]) assert.equal(field(name)?.filterable, true, `${name} must be filterable`);
    for (const name of ["status", "isLatest", "effectiveDate"]) assert.notEqual(field(name)?.searchable, true, `${name} must not be full-text searchable`);
    assert.equal(field("effectiveDate")?.type, "Edm.DateTimeOffset");
    assert.equal(field("isLatest")?.type, "Edm.Boolean");
    for (const name of ["title", "content"]) assert.equal(field(name)?.searchable, true);
  });

  test("declares a cosine HNSW vector field with the embedding dimensions", () => {
    const definition = indexDefinition("policies", 1536);
    const vector = field("contentVector")!;
    assert.equal(vector.type, "Collection(Edm.Single)");
    assert.equal(vector.dimensions, 1536);
    assert.equal(vector.retrievable, false, "do not return large vectors in results");
    const profile = definition.vectorSearch.profiles.find((p) => p.name === vector.vectorSearchProfile);
    assert.ok(profile, "the vector field must reference a declared profile");
    const algorithm = definition.vectorSearch.algorithms.find((a) => a.name === profile.algorithm);
    assert.equal(algorithm?.kind, "hnsw");
    assert.equal(algorithm?.hnswParameters.metric, "cosine");
    assert.equal(indexDefinition("x", 64).fields.find((f) => f.name === "contentVector")?.dimensions, 64);
  });

  test("declares a default semantic configuration over title and content", () => {
    const config = indexDefinition("policies", 1536).semantic.configurations.find((c) => c.name === "default");
    assert.equal(config?.prioritizedFields.titleField.fieldName, "title");
    assert.deepEqual(config?.prioritizedFields.prioritizedContentFields, [{ fieldName: "content" }]);
  });
});

describe("creating the index", () => {
  test("PUTs the definition to the data plane with Entra ID auth", async () => {
    const { http, requests } = fakeHttp(() => ({ status: 201, body: { name: "policies" } }));
    const definition = indexDefinition("policies", 4);
    assert.deepEqual(await createOrUpdateIndex(http, "https://srch.search.windows.net", definition), { name: "policies" });
    assert.deepEqual(requests, [
      { method: "PUT", url: `https://srch.search.windows.net/indexes/policies?api-version=${SEARCH_API}`, body: definition, audience: "search" },
    ]);
  });

  test("an existing index is updated (200) and errors include Azure's message", async () => {
    assert.ok(await createOrUpdateIndex(fakeHttp(() => ({ status: 200, body: {} })).http, "https://s", indexDefinition("p", 4)));
    const forbidden = fakeHttp(() => ({ status: 403, body: { error: { message: "Forbidden" } } }));
    await assert.rejects(createOrUpdateIndex(forbidden.http, "https://s", indexDefinition("p", 4)), { message: "create index failed: 403 Forbidden" });
  });
});

describe.runIf(live)("live: Azure AI Search", () => {
  test("creates the course index and reads it back", { timeout: 60_000 }, async () => {
    const env = live!;
    await createOrUpdateIndex(azureHttp, env.searchEndpoint, indexDefinition(env.indexName, env.dimensions));
    const read = await azureHttp({ method: "GET", url: `${env.searchEndpoint}/indexes/${env.indexName}?api-version=${SEARCH_API}`, audience: "search" });
    assert.equal(read.status, 200);
    assert.equal(read.body.fields.find((f: { name: string }) => f.name === "contentVector").dimensions, env.dimensions);
  });
});
