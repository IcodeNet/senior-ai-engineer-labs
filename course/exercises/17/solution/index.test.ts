import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { SEARCH_API, azureHttp, fakeHttp, live } from "./azure.ts";
import { reviewSearchService, searchUnits, serviceCost, serviceUsage, type SearchServiceSpec } from "./index.ts";

// The course's own service, as azure/main.bicep declares it.
const course: SearchServiceSpec = {
  sku: "basic",
  replicaCount: 1,
  partitionCount: 1,
  semanticSearch: "free",
  disableLocalAuth: true,
  identity: "SystemAssigned",
  tags: { course: "senior-ai-engineer-labs", owner: "learner@example.com", expiresAt: "2026-11-30T12:00:00Z" },
};
const rules = (spec: SearchServiceSpec) => reviewSearchService(spec).map((f) => f.rule);

describe("search units and cost", () => {
  test("units are replicas × partitions", () => {
    assert.equal(searchUnits(course), 1);
    assert.equal(searchUnits({ sku: "standard", replicaCount: 3, partitionCount: 2 }), 6);
    assert.equal(searchUnits({ sku: "basic", replicaCount: 3, partitionCount: 1 }), 3);
  });

  test("invalid capacity is rejected, not silently rounded", () => {
    assert.throws(() => searchUnits({ sku: "standard", replicaCount: 1, partitionCount: 5 }), RangeError);
    assert.throws(() => searchUnits({ sku: "standard", replicaCount: 0, partitionCount: 1 }), RangeError);
    assert.throws(() => searchUnits({ sku: "standard", replicaCount: 13, partitionCount: 1 }), RangeError);
    assert.throws(() => searchUnits({ sku: "basic", replicaCount: 4, partitionCount: 1 }), /Basic allows at most 3 replicas/);
    assert.throws(() => searchUnits({ sku: "free", replicaCount: 2, partitionCount: 1 }), /cannot be scaled/);
    assert.equal(searchUnits({ sku: "free", replicaCount: 1, partitionCount: 1 }), 0);
  });

  test("cost scales linearly with search units and runs around the clock", () => {
    // 0.10 per unit hour is an illustrative number for arithmetic, not a price.
    assert.deepEqual(serviceCost(course, 0.1), { units: 1, hourly: 0.1, thirtyDays: 72 });
    assert.deepEqual(serviceCost({ ...course, sku: "standard", replicaCount: 3 }, 0.1), { units: 3, hourly: 0.3, thirtyDays: 216 });
    assert.deepEqual(serviceCost({ ...course, replicaCount: 1 }, 0.101), { units: 1, hourly: 0.1, thirtyDays: 72.72 });
    assert.throws(() => serviceCost(course, -1), RangeError);
    assert.throws(() => serviceCost(course, Number.NaN), RangeError);
  });
});

describe("reviewing the search service definition", () => {
  test("the course's own definition passes", () => {
    assert.deepEqual(reviewSearchService(course), []);
  });

  test("each broken rule is reported once", () => {
    assert.deepEqual(rules({ ...course, sku: "free" }), ["free-tier"]);
    assert.deepEqual(rules({ ...course, disableLocalAuth: false }), ["local-auth"]);
    assert.deepEqual(rules({ ...course, identity: "None" }), ["identity"]);
    assert.deepEqual(rules({ ...course, semanticSearch: "standard" }), ["semantic-billing"]);
    assert.deepEqual(rules({ ...course, replicaCount: 2 }), ["capacity"]);
    assert.deepEqual(rules({ ...course, tags: { course: "senior-ai-engineer-labs" } }), ["tags"]);
    assert.match(reviewSearchService({ ...course, tags: { owner: "x" } })[0].message, /course, expiresAt/);
  });

  test("several problems at once are all reported", () => {
    const bad: SearchServiceSpec = { ...course, disableLocalAuth: false, identity: "None", tags: {} };
    assert.deepEqual(rules(bad).sort(), ["identity", "local-auth", "tags"]);
  });
});

const stats = {
  counters: {
    documentCount: { usage: 12, quota: null },
    indexesCount: { usage: 1, quota: 15 },
    indexersCount: { usage: 0, quota: 15 },
    dataSourcesCount: { usage: 0, quota: 15 },
    storageSize: { usage: 52_000, quota: 16_106_127_360 },
    vectorIndexSize: { usage: 0, quota: 5_368_709_120 },
  },
};

describe("service statistics", () => {
  test("GETs /servicestats with an Entra ID token for search and maps the counters", async () => {
    const { http, requests } = fakeHttp(() => ({ status: 200, body: stats }));
    const usage = await serviceUsage(http, "https://srch.search.windows.net");
    assert.deepEqual(requests, [{ method: "GET", url: `https://srch.search.windows.net/servicestats?api-version=${SEARCH_API}`, audience: "search" }]);
    assert.deepEqual(usage, {
      indexes: { used: 1, quota: 15 },
      indexers: { used: 0, quota: 15 },
      dataSources: { used: 0, quota: 15 },
      storageBytes: { used: 52_000, quota: 16_106_127_360 },
      vectorIndexBytes: { used: 0, quota: 5_368_709_120 },
    });
  });

  test("failures carry Azure's message; a missing counter is an error, not zero", async () => {
    const forbidden = fakeHttp(() => ({ status: 403, body: { error: { message: "Forbidden" } } }));
    await assert.rejects(serviceUsage(forbidden.http, "https://s"), { message: "service statistics failed: 403 Forbidden" });
    const partial = fakeHttp(() => ({ status: 200, body: { counters: { indexesCount: { usage: 1, quota: 15 } } } }));
    await assert.rejects(serviceUsage(partial.http, "https://s"), /no indexersCount counter/);
    const nullQuota = fakeHttp(() => ({ status: 200, body: { counters: { ...stats.counters, indexersCount: { usage: 2 } } } }));
    assert.deepEqual((await serviceUsage(nullQuota.http, "https://s")).indexers, { used: 2, quota: null });
  });
});

describe.runIf(live)("live: your search service", () => {
  test("reports its limits, keylessly", { timeout: 60_000 }, async () => {
    const usage = await serviceUsage(azureHttp, live!.searchEndpoint);
    assert.ok(usage.indexes.quota! > 0, "a Basic service has an index quota");
    assert.ok(usage.storageBytes.quota! > 0);
    console.log(`indexes ${usage.indexes.used}/${usage.indexes.quota}, storage ${usage.storageBytes.used}/${usage.storageBytes.quota} bytes`);
  });
});
