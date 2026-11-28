import { test } from "vitest";
import assert from "node:assert/strict";
import { validateIndex, type IndexDefinition } from "./schema.ts";
import { documentKey, northbankIndex, reviewGovernance, toSearchDocuments, type FaqSource } from "./index.ts";

const source: FaqSource = {
  sourceUri: "https://support.northbank.example/faq/overdraft-fees",
  title: "Overdraft fees",
  chunks: ["Arranged overdrafts cost 39.9% EAR.", "There is no fee for an unarranged overdraft."],
  status: "approved",
  effectiveDate: "2026-02-01",
  expiryDate: "2026-12-31",
};
const byName = (definition: IndexDefinition, name: string) => definition.fields.find((f) => f.name === name)!;
const findings = (definition: IndexDefinition) => reviewGovernance(definition).map((f) => `${f.field} ${f.rule}`);

test("the Northbank index is valid by step 10's rules and passes the governance review", () => {
  const index = northbankIndex(1536);
  assert.equal(index.name, "northbank-faq-v1");
  assert.deepEqual(validateIndex(index), []);
  assert.deepEqual(reviewGovernance(index), []);
  assert.deepEqual(index.fields.map((f) => f.name), ["id", "title", "chunk", "sourceUri", "status", "effectiveDate", "expiryDate", "contentVector"]);
});

test("governance fields are filterable and typed for range filters", () => {
  const index = northbankIndex(1536);
  assert.equal(byName(index, "status").filterable, true);
  assert.equal(byName(index, "status").searchable, false, "status is matched exactly, never by full-text search");
  assert.equal(byName(index, "effectiveDate").type, "Edm.DateTimeOffset");
  assert.equal(byName(index, "expiryDate").filterable, true);
});

test("text fields are searchable; chunk is never filterable, sortable or facetable", () => {
  const chunk = byName(northbankIndex(1536), "chunk");
  assert.deepEqual([chunk.searchable, chunk.filterable, chunk.sortable, chunk.facetable, chunk.retrievable], [true, false, false, false, true]);
  assert.equal(byName(northbankIndex(1536), "title").searchable, true);
});

test("the vector field is a placeholder: right dimensions, not retrievable, with a profile", () => {
  const vector = byName(northbankIndex(3072), "contentVector");
  assert.equal(vector.dimensions, 3072);
  assert.equal(vector.retrievable, false, "raw vectors are not useful in an answer and cost response size");
  assert.equal(vector.vectorSearchProfile, "northbank-vector-profile");
});

test("documentKey is stable, URL-safe and distinct per chunk", () => {
  const a = documentKey(source.sourceUri, 0);
  assert.equal(a, documentKey(source.sourceUri, 0));
  assert.notEqual(a, documentKey(source.sourceUri, 1));
  assert.match(a, /^[A-Za-z0-9\-_=]+$/);
  assert.equal(Buffer.from(a, "base64url").toString("utf8"), `${source.sourceUri}#0`);
  assert.throws(() => documentKey("", 0), /sourceUri/);
  assert.throws(() => documentKey(source.sourceUri, -1), /chunkIndex/);
  assert.throws(() => documentKey("x".repeat(800), 0), /1024/);
});

test("toSearchDocuments emits one mergeOrUpload document per chunk with DateTimeOffset values", () => {
  const docs = toSearchDocuments(source);
  assert.equal(docs.length, 2);
  assert.deepEqual(docs[1], {
    "@search.action": "mergeOrUpload",
    id: documentKey(source.sourceUri, 1),
    title: "Overdraft fees",
    chunk: "There is no fee for an unarranged overdraft.",
    sourceUri: source.sourceUri,
    status: "approved",
    effectiveDate: "2026-02-01T00:00:00Z",
    expiryDate: "2026-12-31T00:00:00Z",
  });
  assert.equal(toSearchDocuments({ ...source, expiryDate: undefined })[0].expiryDate, null);
});

test("toSearchDocuments rejects data that would make governance filters lie", () => {
  assert.throws(() => toSearchDocuments({ ...source, status: "Approved" as never }), /unknown status/);
  assert.throws(() => toSearchDocuments({ ...source, effectiveDate: "2026-02-30" }), /real YYYY-MM-DD/);
  assert.throws(() => toSearchDocuments({ ...source, effectiveDate: "01/02/2026" }), /real YYYY-MM-DD/);
  assert.throws(() => toSearchDocuments({ ...source, expiryDate: "2026-01-01" }), /before effectiveDate/);
  assert.throws(() => toSearchDocuments({ ...source, chunks: [] }), /at least one chunk/);
});

test("reviewGovernance catches the classic schema mistakes", () => {
  const index = northbankIndex(1536);
  const change = (name: string, patch: object): IndexDefinition => ({ ...index, fields: index.fields.map((f) => (f.name === name ? { ...f, ...patch } : f)) });
  assert.deepEqual(findings(change("status", { filterable: false })), ["status governance-filterable"]);
  assert.deepEqual(findings(change("effectiveDate", { type: "Edm.String", sortable: false })), ["effectiveDate governance-type"]);
  assert.deepEqual(findings(change("chunk", { filterable: true })), ["chunk chunk-too-long-to-filter"]);
  assert.deepEqual(findings(change("sourceUri", { retrievable: false })), ["sourceUri citation-retrievable"]);
  assert.deepEqual(findings(change("title", { facetable: undefined })), ["title explicit-attributes"]);
  assert.deepEqual(findings({ ...index, fields: index.fields.filter((f) => f.name !== "expiryDate") }), ["expiryDate missing-field"]);
  assert.deepEqual(findings(change("status", { searchable: true, filterable: true, type: "Edm.Int32" })), ["status schema", "status governance-type"]);
});
