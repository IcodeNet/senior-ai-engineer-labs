import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { SEARCH_API, azureHttp, fakeHttp, live } from "./azure.ts";
import { northbankIndex, type IndexDefinition } from "./northbank.ts";
import { deployIndex, diffIndex, effective, getIndex, nextVersion, planDeployment } from "./index.ts";

const v1 = () => northbankIndex(1536);
const edit = (change: (d: IndexDefinition) => void) => {
  const d = structuredClone(v1());
  change(d);
  return d;
};
const field = (d: IndexDefinition, name: string) => d.fields.find((f) => f.name === name)!;
const kinds = (a: IndexDefinition, b: IndexDefinition) => diffIndex(a, b).map((c) => `${c.kind}${c.field ? ` ${c.field}` : ""}`);

describe("REST defaults for omitted attributes", () => {
  test("strings are searchable, collections are not sortable, vector fields are only searchable", () => {
    assert.equal(effective({ name: "a", type: "Edm.String" }, "searchable"), true);
    assert.equal(effective({ name: "a", type: "Edm.Int32" }, "searchable"), false);
    assert.equal(effective({ name: "a", type: "Collection(Edm.String)" }, "sortable"), false);
    assert.equal(effective({ name: "a", type: "Edm.DateTimeOffset" }, "filterable"), true);
    assert.equal(effective({ name: "v", type: "Collection(Edm.Single)" }, "searchable"), true);
    assert.equal(effective({ name: "v", type: "Collection(Edm.Single)" }, "retrievable"), false);
    assert.equal(effective({ name: "v", type: "Collection(Edm.Single)" }, "filterable"), false);
    assert.equal(effective({ name: "a", type: "Edm.String", searchable: false }, "searchable"), false);
  });
});

describe("planning a schema change", () => {
  test("nothing on the service: create", () => {
    assert.deepEqual(planDeployment(undefined, v1()), { action: "create", changes: [], rebuildReasons: [] });
  });

  test("the same definition, even as Azure returns it with defaults filled in, needs nothing", () => {
    const returned = edit((d) => {
      const v = field(d, "contentVector");
      Object.assign(v, { filterable: false, sortable: false, facetable: false, analyzer: null });
    });
    assert.deepEqual(planDeployment(returned, v1()), { action: "none", changes: [], rebuildReasons: [] });
  });

  test("adding a field, changing retrievable or the description is an in-place update", () => {
    const added = edit((d) => d.fields.push({ name: "keyPhrases", type: "Collection(Edm.String)", searchable: true, filterable: true, retrievable: true, sortable: false, facetable: true }));
    assert.deepEqual(planDeployment(v1(), added), { action: "update", changes: [{ kind: "add-field", field: "keyPhrases", detail: "keyPhrases is added" }], rebuildReasons: [] });
    assert.deepEqual(kinds(v1(), edit((d) => (field(d, "sourceUri").retrievable = false))), ["change-retrievable sourceUri"]);
    assert.equal(planDeployment(v1(), edit((d) => (field(d, "sourceUri").retrievable = false))).action, "update");
    assert.deepEqual(kinds(v1(), edit((d) => (d.description = "new"))), ["change-description"]);
  });

  test("changes to how a field is indexed need a rebuild, with the reason", () => {
    const facetable = planDeployment(v1(), edit((d) => (field(d, "title").facetable = true)));
    assert.equal(facetable.action, "rebuild");
    assert.deepEqual(facetable.rebuildReasons, ["title facetable false → true"]);
    assert.deepEqual(kinds(v1(), edit((d) => (field(d, "status").type = "Edm.Boolean"))), ["change-type status"]);
    assert.deepEqual(kinds(v1(), edit((d) => (field(d, "chunk").analyzer = "en.microsoft"))), ["change-analyzer chunk"]);
    assert.deepEqual(kinds(v1(), edit((d) => (field(d, "contentVector").dimensions = 3072))), ["change-dimensions contentVector"]);
    assert.deepEqual(kinds(v1(), edit((d) => (field(d, "contentVector").vectorSearchProfile = "other"))), ["change-vector-profile contentVector"]);
    assert.deepEqual(kinds(v1(), edit((d) => (d.fields = d.fields.filter((f) => f.name !== "expiryDate")))), ["remove-field expiryDate"]);
    assert.deepEqual(kinds(v1(), edit((d) => { field(d, "id").key = false; field(d, "sourceUri").key = true; })), ["change-key id", "change-key sourceUri"]);
    for (const change of [(d: IndexDefinition) => (field(d, "chunk").filterable = true), (d: IndexDefinition) => (field(d, "effectiveDate").sortable = false), (d: IndexDefinition) => (field(d, "title").searchable = false)])
      assert.equal(planDeployment(v1(), edit(change)).action, "rebuild");
  });

  test("a rebuild wins over updates in the same plan, and lists every change", () => {
    const plan = planDeployment(v1(), edit((d) => { d.description = "x"; field(d, "title").filterable = true; }));
    assert.equal(plan.action, "rebuild");
    assert.equal(plan.changes.length, 2);
    assert.deepEqual(plan.rebuildReasons, ["title filterable false → true"]);
  });

  test("versioned names for side-by-side rebuilds", () => {
    assert.equal(nextVersion("northbank-faq-v1"), "northbank-faq-v2");
    assert.equal(nextVersion("northbank-faq-v9"), "northbank-faq-v10");
    assert.equal(nextVersion("policies"), "policies-v2");
  });
});

describe("deploying through the REST API", () => {
  const endpoint = "https://srch.search.windows.net";
  const url = `${endpoint}/indexes/northbank-faq-v1?api-version=${SEARCH_API}`;

  test("a new index: GET 404, then PUT the definition", async () => {
    const { http, requests } = fakeHttp((r) => (r.method === "GET" ? { status: 404, body: null } : { status: 201, body: {} }));
    assert.equal((await deployIndex(http, endpoint, v1())).action, "create");
    assert.deepEqual(requests, [
      { method: "GET", url, audience: "search" },
      { method: "PUT", url, body: v1(), audience: "search" },
    ]);
  });

  test("an unchanged index is not written again; an update is a PUT that may return 200", async () => {
    const same = fakeHttp(() => ({ status: 200, body: v1() }));
    assert.equal((await deployIndex(same.http, endpoint, v1())).action, "none");
    assert.deepEqual(same.requests.map((r) => r.method), ["GET"]);
    const update = fakeHttp((r) => (r.method === "GET" ? { status: 200, body: v1() } : { status: 200, body: {} }));
    const desired = edit((d) => (d.description = "v1, with a better description"));
    assert.equal((await deployIndex(update.http, endpoint, desired)).action, "update");
    assert.deepEqual(update.requests.map((r) => r.method), ["GET", "PUT"]);
  });

  test("a rebuild is refused: no PUT, no DELETE, and the error names the next version", async () => {
    const { http, requests } = fakeHttp(() => ({ status: 200, body: v1() }));
    await assert.rejects(deployIndex(http, endpoint, edit((d) => (field(d, "title").filterable = true))), /rebuild required for northbank-faq-v1: title filterable false → true\. Create northbank-faq-v2/);
    assert.deepEqual(requests.map((r) => r.method), ["GET"]);
  });

  test("errors carry Azure's message", async () => {
    const getFails = fakeHttp(() => ({ status: 403, body: { error: { message: "Forbidden" } } }));
    await assert.rejects(getIndex(getFails.http, endpoint, "northbank-faq-v1"), { message: "get index failed: 403 Forbidden" });
    const putFails = fakeHttp((r) => (r.method === "GET" ? { status: 404, body: null } : { status: 400, body: { error: { message: "Bad field" } } }));
    await assert.rejects(deployIndex(putFails.http, endpoint, v1()), { message: "create or update index failed: 400 Bad field" });
  });
});

describe.runIf(live)("live: the Northbank index", () => {
  test("is created (or already matches), reads back, and a second deploy changes nothing", { timeout: 60_000 }, async () => {
    const env = live!;
    const desired = northbankIndex(env.dimensions);
    const first = await deployIndex(azureHttp, env.searchEndpoint, desired);
    assert.ok(["create", "none", "update"].includes(first.action), first.action);
    const read = await getIndex(azureHttp, env.searchEndpoint, desired.name);
    assert.equal(read?.fields.find((f) => f.name === "contentVector")?.dimensions, env.dimensions);
    assert.equal((await deployIndex(azureHttp, env.searchEndpoint, desired)).action, "none");
  });
});
