import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { SEARCH_API, azureHttp, fakeHttp, live } from "./azure.ts";
import { NORTHBANK_DOCUMENTS, governanceFilter, northbankIndex } from "./northbank.ts";
import { SELECT, assertGoverned, buildSearchRequest, search, type Hit } from "./index.ts";

const asOf = "2026-11-28";
const hit = (over: Partial<Hit> = {}): Hit => ({
  id: "k1",
  title: "Overdraft fees",
  chunk: "An arranged overdraft costs 39.9% EAR variable.",
  sourceUri: "https://support.northbank.example/faq/overdraft-fees",
  status: "approved",
  effectiveDate: "2026-02-01T00:00:00Z",
  expiryDate: null,
  score: 2.1,
  highlights: [],
  ...over,
});

describe("building a governed search request", () => {
  test("defaults: simple syntax, title and chunk, citations selected, governance filter, top 5, a count", () => {
    assert.deepEqual(buildSearchRequest("overdraft fee", { asOf }), {
      search: "overdraft fee",
      queryType: "simple",
      searchMode: "any",
      searchFields: "title,chunk",
      select: "id,title,chunk,sourceUri,status,effectiveDate,expiryDate",
      filter: governanceFilter(asOf),
      top: 5,
      skip: 0,
      count: true,
    });
    assert.equal(SELECT.includes("contentVector"), false, "never return vectors");
  });

  test("a caller filter is ANDed inside parentheses, so it can only narrow governance", () => {
    const request = buildSearchRequest("fees", { asOf, filter: "sourceUri eq 'x' or status eq 'draft'" });
    assert.equal(request.filter, `(${governanceFilter(asOf)}) and (sourceUri eq 'x' or status eq 'draft')`);
  });

  test("paging, full syntax, highlighting and facets are opt-in; an empty search matches everything", () => {
    const request = buildSearchRequest("", { asOf, top: 10, skip: 10, queryType: "full", highlight: true, facets: ["status,count:5"], searchFields: ["chunk"] });
    assert.equal(request.search, "*");
    assert.deepEqual([request.top, request.skip, request.queryType, request.highlight, request.facets, request.searchFields], [10, 10, "full", "chunk", ["status,count:5"], "chunk"]);
  });

  test("impossible requests fail before they reach the service", () => {
    assert.throws(() => buildSearchRequest("x", { asOf, top: 0 }), RangeError);
    assert.throws(() => buildSearchRequest("x", { asOf, top: 51 }), RangeError);
    assert.throws(() => buildSearchRequest("x", { asOf, skip: -1 }), RangeError);
    assert.throws(() => buildSearchRequest("x", { asOf, searchFields: ["status"] }), /status is not searchable/);
    assert.throws(() => buildSearchRequest("x", { asOf, facets: ["title"] }), /title is not facetable/);
    assert.throws(() => buildSearchRequest("x", { asOf: "28/11/2026" }), /asOf must be YYYY-MM-DD/);
  });
});

describe("calling the service and reading the response", () => {
  const response = {
    "@odata.count": 2,
    "@search.facets": { status: [{ value: "approved", count: 2 }] },
    value: [
      { "@search.score": 3.2, "@search.highlights": { chunk: ["An arranged <em>overdraft</em> costs…"] }, ...hit(), score: undefined, highlights: undefined },
      { "@search.score": 1.1, ...hit({ id: "k2", expiryDate: "2026-12-31T00:00:00Z" }), score: undefined, highlights: undefined },
    ],
  };

  test("POSTs the request to docs/search and maps count, scores, highlights and facets", async () => {
    const { http, requests } = fakeHttp(() => ({ status: 200, body: response }));
    const request = buildSearchRequest("overdraft", { asOf, highlight: true, facets: ["status"] });
    const result = await search(http, "https://srch.search.windows.net", "northbank-faq-v1", request);
    assert.deepEqual(requests, [{ method: "POST", url: `https://srch.search.windows.net/indexes/northbank-faq-v1/docs/search?api-version=${SEARCH_API}`, body: request, audience: "search" }]);
    assert.equal(result.count, 2);
    assert.deepEqual(result.hits.map((h) => [h.id, h.score, h.highlights]), [["k1", 3.2, ["An arranged <em>overdraft</em> costs…"]], ["k2", 1.1, []]]);
    assert.equal(result.hits[1].expiryDate, "2026-12-31T00:00:00Z");
    assert.deepEqual(result.facets, { status: [{ value: "approved", count: 2 }] });
  });

  test("errors carry Azure's message (for example an invalid filter)", async () => {
    const { http } = fakeHttp(() => ({ status: 400, body: { error: { message: "Invalid expression: Could not find a property named 'approved'" } } }));
    await assert.rejects(search(http, "https://s", "i", buildSearchRequest("x", { asOf })), /search failed: 400 Invalid expression/);
  });
});

describe("checking governance on every hit", () => {
  test("approved, in-force hits pass through unchanged", () => {
    const hits = [hit(), hit({ id: "k2", expiryDate: "2026-11-28T00:00:00Z" }), hit({ id: "k3", effectiveDate: "2026-11-28T00:00:00Z" })];
    assert.deepEqual(assertGoverned(hits, asOf), hits);
  });

  test("a draft, a retired, a future or an expired hit is a breach", () => {
    assert.throws(() => assertGoverned([hit({ status: "draft" })], asOf), /governance breach: k1 has status draft/);
    assert.throws(() => assertGoverned([hit({ status: "retired" })], asOf), /status retired/);
    assert.throws(() => assertGoverned([hit({ effectiveDate: "2027-02-01T00:00:00Z" })], asOf), /not in force until 2027-02-01/);
    assert.throws(() => assertGoverned([hit({ expiryDate: "2026-11-27T00:00:00Z" })], asOf), /expired on 2026-11-27/);
  });
});

describe.runIf(live)("live: query northbank-faq-v1", () => {
  test("finds the approved answer, never the draft or the future rate, and facets show only approved", { timeout: 120_000 }, async () => {
    const env = live!;
    const index = northbankIndex(env.dimensions);
    const base = `${env.searchEndpoint}/indexes/${index.name}`;
    if ((await azureHttp({ method: "GET", url: `${base}?api-version=${SEARCH_API}`, audience: "search" })).status === 404)
      await azureHttp({ method: "PUT", url: `${base}?api-version=${SEARCH_API}`, body: index, audience: "search" });
    const loaded = await azureHttp({ method: "POST", url: `${base}/docs/index?api-version=${SEARCH_API}`, body: { value: NORTHBANK_DOCUMENTS }, audience: "search" });
    assert.equal(loaded.status, 200, JSON.stringify(loaded.body));
    let result = await search(azureHttp, env.searchEndpoint, index.name, buildSearchRequest("overdraft fee", { asOf, highlight: true, facets: ["status"] }));
    for (let i = 0; i < 15 && result.count < 2; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      result = await search(azureHttp, env.searchEndpoint, index.name, buildSearchRequest("overdraft fee", { asOf, highlight: true, facets: ["status"] }));
    }
    assertGoverned(result.hits, asOf);
    assert.match(result.hits[0].sourceUri, /overdraft-fees$/);
    assert.ok(result.hits.every((h) => !h.sourceUri.endsWith("overdraft-fees-2027")), "the draft never appears");
    assert.deepEqual(result.facets.status?.map((f) => f.value), ["approved"]);
    const future = await search(azureHttp, env.searchEndpoint, index.name, buildSearchRequest("Easy Saver rate", { asOf }));
    assert.ok(future.hits.every((h) => !h.sourceUri.endsWith("savings-rate-2027")), "an answer not yet in force never appears");
    console.log(result.hits.map((h) => `${h.score.toFixed(2)}  ${h.title}  ${h.highlights[0] ?? ""}`).join("\n"));
  });
});
