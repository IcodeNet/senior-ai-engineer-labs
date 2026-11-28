import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { SEARCH_API, azureHttp, fakeHttp, live, type HttpRequest } from "./azure.ts";
import { NORTHBANK_DOCUMENTS, northbankIndex } from "./northbank.ts";
import { LIMITS, PayloadTooLargeError, batches, deleteActions, indexBatch, mergeAction, pushAll, type IndexAction, type ItemResult } from "./index.ts";

const doc = (id: string, chunk = "text"): IndexAction => ({ "@search.action": "mergeOrUpload", id, chunk });
const ok = (key: string, statusCode = 200): ItemResult => ({ key, status: true, statusCode });
const bad = (key: string, statusCode: number, errorMessage = "failed"): ItemResult => ({ key, status: false, statusCode, errorMessage });
const ids = (bs: IndexAction[][]) => bs.map((b) => b.map((a) => a.id));
const sent = (r: HttpRequest) => (r.body as { value: IndexAction[] }).value;
const noSleep = { sleep: async () => {} };

describe("actions", () => {
  test("delete sends only the key; merge sends only the fields that change", () => {
    assert.deepEqual(deleteActions(["a", "b"]), [{ "@search.action": "delete", id: "a" }, { "@search.action": "delete", id: "b" }]);
    assert.deepEqual(mergeAction("a", { status: "retired" }), { "@search.action": "merge", id: "a", status: "retired" });
    assert.throws(() => deleteActions([""]), /needs a document key/);
    assert.throws(() => mergeAction("a", {}), /at least one field/);
    assert.throws(() => mergeAction("a", { id: "b" }), /must not contain the key/);
    assert.throws(() => mergeAction("", { status: "x" }), /needs a document key/);
  });
});

describe("batching within the service limits", () => {
  test("the documented limits are 1,000 documents or 16 MB per request", () => {
    assert.deepEqual(LIMITS, { maxDocs: 1000, maxBytes: 16 * 1024 * 1024 });
  });

  test("splits by document count, in order", () => {
    const actions = ["a", "b", "c", "d", "e"].map((id) => doc(id));
    assert.deepEqual(ids(batches(actions, { maxDocs: 2, maxBytes: 1e6 })), [["a", "b"], ["c", "d"], ["e"]]);
    assert.deepEqual(batches([], { maxDocs: 2, maxBytes: 1e6 }), []);
  });

  test("splits by the size of the JSON request body", () => {
    const actions = ["a", "b", "c"].map((id) => doc(id, "x".repeat(100)));
    const one = Buffer.byteLength(JSON.stringify({ value: [actions[0]] }));
    const two = Buffer.byteLength(JSON.stringify({ value: actions.slice(0, 2) }));
    assert.deepEqual(ids(batches(actions, { maxDocs: 100, maxBytes: two })), [["a", "b"], ["c"]]);
    assert.deepEqual(ids(batches(actions, { maxDocs: 100, maxBytes: two - 1 })), [["a"], ["b"], ["c"]]);
    assert.ok(one < two);
    assert.throws(() => batches(actions, { maxDocs: 100, maxBytes: one - 1 }), PayloadTooLargeError);
  });

  test("a key appears at most once per request, because order within a request is not guaranteed", () => {
    const actions = [doc("a"), doc("b"), mergeAction("a", { status: "retired" }), doc("c")];
    assert.deepEqual(ids(batches(actions, { maxDocs: 10, maxBytes: 1e6 })), [["a", "b"], ["a", "c"]]);
  });
});

describe("one request", () => {
  test("POSTs { value } to docs/index and returns per-document results for 200 and 207", async () => {
    const { http, requests } = fakeHttp(() => ({ status: 207, body: { value: [ok("a", 201), bad("b", 400)] } }));
    assert.deepEqual(await indexBatch(http, "https://srch.search.windows.net", "northbank-faq-v1", [doc("a"), doc("b")]), [ok("a", 201), bad("b", 400)]);
    assert.deepEqual(requests, [
      { method: "POST", url: `https://srch.search.windows.net/indexes/northbank-faq-v1/docs/index?api-version=${SEARCH_API}`, body: { value: [doc("a"), doc("b")] }, audience: "search" },
    ]);
  });

  test("413 is its own error; other failures carry Azure's message", async () => {
    await assert.rejects(indexBatch(fakeHttp(() => ({ status: 413, body: null })).http, "https://s", "i", [doc("a")]), PayloadTooLargeError);
    await assert.rejects(indexBatch(fakeHttp(() => ({ status: 403, body: { error: { message: "Forbidden" } } })).http, "https://s", "i", [doc("a")]), {
      message: "indexing failed: 403 Forbidden",
    });
  });
});

describe("pushing everything", () => {
  test("a 207 is not success: the failed document is reported, the rest counted", async () => {
    const { http } = fakeHttp((r) => ({ status: 207, body: { value: sent(r).map((a) => (a.id === "b" ? bad("b", 400, "Invalid date") : ok(a.id))) } }));
    assert.deepEqual(await pushAll(http, "https://s", "i", [doc("a"), doc("b"), doc("c")], noSleep), {
      succeeded: 2,
      failed: [bad("b", 400, "Invalid date")],
      requests: 1,
    });
  });

  test("retryable documents (409, 422, 503) are resent alone, with exponential backoff", async () => {
    let calls = 0;
    const delays: number[] = [];
    const { http, requests } = fakeHttp((r) => {
      calls++;
      return { status: 207, body: { value: sent(r).map((a) => (a.id === "b" && calls < 3 ? bad("b", 503, "busy") : ok(a.id))) } };
    });
    const result = await pushAll(http, "https://s", "i", [doc("a"), doc("b")], { baseDelayMs: 100, sleep: async (ms) => void delays.push(ms) });
    assert.deepEqual(result, { succeeded: 2, failed: [], requests: 3 });
    assert.deepEqual(requests.map((r) => sent(r).map((a) => a.id)), [["a", "b"], ["b"], ["b"]]);
    assert.deepEqual(delays, [100, 200]);
  });

  test("retries stop after the limit, and non-retryable failures are never retried", async () => {
    const { http, requests } = fakeHttp((r) => ({ status: 207, body: { value: sent(r).map((a) => (a.id === "a" ? bad("a", 409) : bad(a.id, 404, "Document not found."))) } }));
    const result = await pushAll(http, "https://s", "i", [doc("a"), doc("b")], { retries: 2, ...noSleep });
    assert.deepEqual(result.failed.map((f) => [f.key, f.statusCode]).sort(), [["a", 409], ["b", 404]]);
    assert.equal(requests.length, 3);
    assert.equal(result.succeeded, 0);
  });

  test("a request rejected as too large is split in half until it fits", async () => {
    const { http, requests } = fakeHttp((r) => (sent(r).length > 1 ? { status: 413, body: null } : { status: 200, body: { value: sent(r).map((a) => ok(a.id)) } }));
    const result = await pushAll(http, "https://s", "i", [doc("a"), doc("b"), doc("c")], noSleep);
    assert.equal(result.succeeded, 3);
    assert.deepEqual(requests.map((r) => sent(r).length), [3, 2, 1, 1, 1]);
  });

  test("respects the batch limits it is given", async () => {
    const { http, requests } = fakeHttp((r) => ({ status: 200, body: { value: sent(r).map((a) => ok(a.id)) } }));
    const actions = Array.from({ length: 5 }, (_, i) => doc(`d${i}`));
    assert.equal((await pushAll(http, "https://s", "i", actions, { maxDocs: 2, ...noSleep })).succeeded, 5);
    assert.deepEqual(requests.map((r) => sent(r).length), [2, 2, 1]);
  });
});

describe.runIf(live)("live: push the Northbank corpus", () => {
  test("loads every chunk, merges one field, and the document reads back", { timeout: 120_000 }, async () => {
    const env = live!;
    const index = northbankIndex(env.dimensions);
    const exists = await azureHttp({ method: "GET", url: `${env.searchEndpoint}/indexes/${index.name}?api-version=${SEARCH_API}`, audience: "search" });
    if (exists.status === 404) await azureHttp({ method: "PUT", url: `${env.searchEndpoint}/indexes/${index.name}?api-version=${SEARCH_API}`, body: index, audience: "search" });
    const result = await pushAll(azureHttp, env.searchEndpoint, index.name, NORTHBANK_DOCUMENTS);
    assert.deepEqual(result.failed, []);
    assert.equal(result.succeeded, NORTHBANK_DOCUMENTS.length);
    const target = NORTHBANK_DOCUMENTS[0];
    const merged = await pushAll(azureHttp, env.searchEndpoint, index.name, [mergeAction(target.id, { title: `${target.title} (checked)` })]);
    assert.equal(merged.succeeded, 1);
    // Documents become visible a few seconds after a successful request: poll briefly.
    let lookup = { status: 0, body: null as any };
    for (let i = 0; i < 15 && lookup.body?.title !== `${target.title} (checked)`; i++) {
      if (i) await new Promise((r) => setTimeout(r, 1000));
      lookup = await azureHttp({ method: "GET", url: `${env.searchEndpoint}/indexes/${index.name}/docs/${encodeURIComponent(target.id)}?api-version=${SEARCH_API}`, audience: "search" });
    }
    assert.equal(lookup.status, 200);
    assert.equal(lookup.body.title, `${target.title} (checked)`);
    assert.equal(lookup.body.chunk, target.chunk, "merge keeps the fields it does not name");
    await pushAll(azureHttp, env.searchEndpoint, index.name, [target]); // restore
  });
});
