import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { SEARCH_API, STORAGE_API, azureHttp, fakeEnv, fakeHttp, liveStorage } from "./azure.ts";
import { NORTHBANK_DOCUMENTS } from "./northbank.ts";
import {
  BLOB,
  INDEXER,
  PULL_INDEX,
  blobUrl,
  createOrUpdate,
  dataSourceDefinition,
  indexerDefinition,
  pullIndex,
  runIndexer,
  simulateJsonArray,
  toBlobRecords,
  uploadBlob,
  waitForIndexer,
} from "./index.ts";

const endpoint = "https://srch.search.windows.net";
const status = (lastResult: unknown, overall = "running") => ({ status: 200, body: { status: overall, lastResult } });
const run = (s: string, extra: Record<string, unknown> = {}) => ({ status: s, startTime: "2026-11-28T10:00:05Z", itemsProcessed: 12, itemsFailed: 0, errors: [], warnings: [], ...extra });
const since = new Date("2026-11-28T10:00:00Z");

describe("the pull index and the blob", () => {
  test("the pull index is the Northbank schema plus filterable, facetable enrichment fields", () => {
    const index = pullIndex(1536);
    assert.equal(index.name, "northbank-faq-pull-v1");
    const keyPhrases = index.fields.find((f) => f.name === "keyPhrases")!;
    assert.deepEqual([keyPhrases.type, keyPhrases.searchable, keyPhrases.filterable, keyPhrases.facetable, keyPhrases.sortable], ["Collection(Edm.String)", true, true, true, false]);
    const language = index.fields.find((f) => f.name === "language")!;
    assert.deepEqual([language.type, language.searchable, language.filterable, language.facetable], ["Edm.String", false, true, true]);
    assert.equal(index.fields.filter((f) => f.name === "status" && f.filterable).length, 1, "governance fields stay");
  });

  test("blob records are search documents without the push action", () => {
    const [record] = toBlobRecords(NORTHBANK_DOCUMENTS);
    assert.equal("@search.action" in record, false);
    assert.equal(record.id, NORTHBANK_DOCUMENTS[0].id);
    assert.equal(toBlobRecords(NORTHBANK_DOCUMENTS).length, NORTHBANK_DOCUMENTS.length);
  });

  test("uploads with a storage token, as a block blob, with a service version that accepts Entra ID", async () => {
    const { http, requests } = fakeHttp(() => ({ status: 201, body: null }));
    const records = toBlobRecords(NORTHBANK_DOCUMENTS.slice(0, 2));
    await uploadBlob(http, fakeEnv, BLOB, records);
    assert.deepEqual(requests, [
      {
        method: "PUT",
        url: "https://sttest.blob.core.windows.net/northbank-faq/faq/northbank-faq.json",
        body: JSON.stringify(records),
        audience: "storage",
        headers: { "x-ms-blob-type": "BlockBlob", "x-ms-version": STORAGE_API, "content-type": "application/json" },
      },
    ]);
    assert.equal(blobUrl({ ...fakeEnv, blobEndpoint: "https://sttest.blob.core.windows.net" }, "guides/a b.json"), "https://sttest.blob.core.windows.net/northbank-faq/guides/a%20b.json");
    await assert.rejects(uploadBlob(fakeHttp(() => ({ status: 403, body: "<Error/>" })).http, fakeEnv, BLOB, records), { message: "blob upload failed: 403" });
  });
});

describe("data source and indexer definitions", () => {
  test("the data source is keyless: the connection string is the storage account's resource ID", () => {
    assert.deepEqual(dataSourceDefinition(fakeEnv), {
      name: "northbank-blob",
      type: "azureblob",
      credentials: { connectionString: `ResourceId=${fakeEnv.storageAccountId};` },
      container: { name: "northbank-faq", query: "faq/" },
    });
    assert.deepEqual(dataSourceDefinition(fakeEnv, "other", "guides/").container, { name: "northbank-faq", query: "guides/" });
    assert.doesNotMatch(JSON.stringify(dataSourceDefinition(fakeEnv)), /AccountKey|SharedAccessSignature/);
    assert.throws(() => dataSourceDefinition({ ...fakeEnv, storageAccountId: "DefaultEndpointsProtocol=https;AccountName=x;AccountKey=y" }), /not a storage account resource ID/);
  });

  test("the indexer parses each .json blob as a JSON array into the pull index", () => {
    assert.deepEqual(indexerDefinition(), {
      name: INDEXER,
      dataSourceName: "northbank-blob",
      targetIndexName: PULL_INDEX,
      parameters: { configuration: { parsingMode: "jsonArray", indexedFileNameExtensions: ".json" } },
      fieldMappings: [],
    });
  });

  test("definitions are PUT by name; the status says whether it was created or updated", async () => {
    const { http, requests } = fakeHttp(() => ({ status: 201, body: {} }));
    assert.equal(await createOrUpdate(http, endpoint, "datasources", dataSourceDefinition(fakeEnv)), 201);
    assert.deepEqual(requests[0], { method: "PUT", url: `${endpoint}/datasources/northbank-blob?api-version=${SEARCH_API}`, body: dataSourceDefinition(fakeEnv), audience: "search" });
    assert.equal(await createOrUpdate(fakeHttp(() => ({ status: 200, body: {} })).http, endpoint, "indexers", indexerDefinition()), 200);
    await assert.rejects(createOrUpdate(fakeHttp(() => ({ status: 400, body: { error: { message: "Credentials are invalid" } } })).http, endpoint, "datasources", dataSourceDefinition(fakeEnv)), {
      message: "create datasources northbank-blob failed: 400 Credentials are invalid",
    });
  });
});

describe("how one blob becomes many documents (a model)", () => {
  const blob = (path: string, elements: unknown) => ({ path, content: JSON.stringify(elements) });

  test("each array element is one document, keyed by its own id", () => {
    const sim = simulateJsonArray([blob("faq.json", [{ id: "a", chunk: "one" }, { id: "b", chunk: "two" }])], "id");
    assert.deepEqual(sim, { documents: [{ id: "a", chunk: "one" }, { id: "b", chunk: "two" }], merged: [], errors: [] });
  });

  test("without a key field, keys are generated per blob position, so the same element in two blobs is two documents", () => {
    const sim = simulateJsonArray([blob("a.json", [{ chunk: "x" }]), blob("b.json", [{ chunk: "x" }])], "id");
    assert.equal(sim.documents.length, 2);
    assert.notEqual(sim.documents[0].id, sim.documents[1].id);
  });

  test("an id that repeats across blobs merges: later non-null values win, nulls keep the earlier value", () => {
    const sim = simulateJsonArray(
      [blob("a.json", [{ id: "1", title: "Fees", status: "approved" }]), blob("b.json", [{ id: "1", title: null, status: "retired" }])],
      "id",
    );
    assert.deepEqual(sim.documents, [{ id: "1", title: "Fees", status: "retired" }]);
    assert.deepEqual(sim.merged, ["1"]);
  });

  test("invalid content is reported per blob and element, and the rest still indexes", () => {
    const sim = simulateJsonArray(
      [{ path: "bad.json", content: "{not json" }, blob("object.json", { id: "x" }), blob("mixed.json", [{ id: "ok" }, 42, [1]])],
      "id",
    );
    assert.deepEqual(sim.documents, [{ id: "ok" }]);
    assert.deepEqual(sim.errors, ["bad.json: not valid JSON", "object.json: the top level is not a JSON array", "mixed.json[1]: an element is not a JSON object", "mixed.json[2]: an element is not a JSON object"]);
  });

  test("the Northbank blob produces exactly the pushed documents, with no merges", () => {
    const sim = simulateJsonArray([blob(BLOB, toBlobRecords(NORTHBANK_DOCUMENTS))], "id");
    assert.equal(sim.documents.length, NORTHBANK_DOCUMENTS.length);
    assert.deepEqual(sim.merged, []);
  });
});

describe("running the indexer", () => {
  test("run is accepted with 202 and is not a result", async () => {
    const { http, requests } = fakeHttp(() => ({ status: 202, body: null }));
    await runIndexer(http, endpoint, INDEXER);
    assert.deepEqual(requests, [{ method: "POST", url: `${endpoint}/indexers/${INDEXER}/run?api-version=${SEARCH_API}`, audience: "search" }]);
    await assert.rejects(runIndexer(fakeHttp(() => ({ status: 409, body: { error: { message: "Another indexer invocation is currently in progress" } } })).http, endpoint, INDEXER), /409 Another indexer/);
  });

  test("waits through a stale earlier run and inProgress, then returns the counts", async () => {
    const answers = [status(run("success", { startTime: "2026-11-28T09:00:00Z" })), status(run("inProgress")), status(run("success", { warnings: [{ message: "Truncated" }] }))];
    const { http, requests } = fakeHttp(() => answers.shift()!);
    const sleeps: number[] = [];
    const result = await waitForIndexer(http, endpoint, INDEXER, { since, pollMs: 50, sleep: async (ms) => void sleeps.push(ms) });
    assert.deepEqual(result, { itemsProcessed: 12, itemsFailed: 0, warnings: ["Truncated"] });
    assert.equal(requests.length, 3);
    assert.deepEqual(requests[0], { method: "GET", url: `${endpoint}/indexers/${INDEXER}/status?api-version=${SEARCH_API}`, audience: "search" });
    assert.deepEqual(sleeps, [50, 50]);
  });

  test("a failed run, failed items or an error state are errors with the first message", async () => {
    const fails = (body: unknown) => waitForIndexer(fakeHttp(() => ({ status: 200, body })).http, endpoint, INDEXER, { since, sleep: async () => {} });
    await assert.rejects(fails({ status: "running", lastResult: run("transientFailure", { errors: [{ errorMessage: "403 This request is not authorized" }] }) }), /transientFailure: 403 This request is not authorized/);
    await assert.rejects(fails({ status: "running", lastResult: run("success", { itemsFailed: 1, errors: [{ key: "k1", errorMessage: "Invalid date" }] }) }), /1 item\(s\) failed: k1: Invalid date/);
    await assert.rejects(fails({ status: "error", lastResult: null }), /error state/);
  });

  test("never finishing is a timeout, not a hang", async () => {
    let clock = 0;
    const { http } = fakeHttp(() => status(null));
    await assert.rejects(
      waitForIndexer(http, endpoint, INDEXER, { since, timeoutMs: 1000, pollMs: 400, now: () => clock, sleep: async (ms) => void (clock += ms) }),
      /did not finish within 1000 ms/,
    );
  });
});

describe.runIf(liveStorage)("live: Blob → indexer → index", () => {
  test("uploads the corpus, runs the indexer and finds every document", { timeout: 300_000 }, async () => {
    const env = liveStorage!;
    // Upload only when the blob is missing: re-uploading changes it, and the indexers then reprocess every element, which
    // counts against the skills' free 20 documents per indexer per day (12 elements here).
    const existing = await azureHttp({ method: "GET", url: blobUrl(env, BLOB), audience: "storage", headers: { "x-ms-version": STORAGE_API } });
    if (existing.status === 404) await uploadBlob(azureHttp, env, BLOB, toBlobRecords(NORTHBANK_DOCUMENTS));
    else assert.equal(existing.status, 200);
    await createOrUpdate(azureHttp, env.searchEndpoint, "indexes", pullIndex(env.dimensions));
    await createOrUpdate(azureHttp, env.searchEndpoint, "datasources", dataSourceDefinition(env));
    const started = new Date(Date.now() - 5_000);
    // Creating an indexer runs it once; an update does not, so run it explicitly then.
    if ((await createOrUpdate(azureHttp, env.searchEndpoint, "indexers", indexerDefinition())) === 200) await runIndexer(azureHttp, env.searchEndpoint, INDEXER);
    const result = await waitForIndexer(azureHttp, env.searchEndpoint, INDEXER, { since: started, timeoutMs: 240_000 });
    console.log(`indexer processed ${result.itemsProcessed} item(s)`);
    let count = 0;
    for (let i = 0; i < 20 && count < NORTHBANK_DOCUMENTS.length; i++) {
      if (i) await new Promise((r) => setTimeout(r, 2000));
      const response = await azureHttp({ method: "GET", url: `${env.searchEndpoint}/indexes/${PULL_INDEX}/docs/$count?api-version=${SEARCH_API}`, audience: "search" });
      count = Number.parseInt(String(response.body).replace(/[^0-9]/g, ""), 10);
    }
    assert.equal(count, NORTHBANK_DOCUMENTS.length);
  });
});
