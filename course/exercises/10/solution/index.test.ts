import { test } from "vitest";
import assert from "node:assert/strict";
import { effectiveAttributes, validateIndex, type Field, type IndexDefinition } from "./index.ts";

const vectorSearch = { algorithms: [{ name: "hnsw-1", kind: "hnsw" }], profiles: [{ name: "vp-1", algorithm: "hnsw-1" }] };
const good: IndexDefinition = {
  name: "faq-v1",
  fields: [
    { name: "id", type: "Edm.String", key: true, searchable: false, filterable: true, retrievable: true, sortable: false, facetable: false },
    { name: "title", type: "Edm.String", searchable: true, filterable: false, retrievable: true, sortable: false, facetable: false, analyzer: "en.microsoft" },
    { name: "tags", type: "Collection(Edm.String)", searchable: true, filterable: true, retrievable: true, sortable: false, facetable: true },
    { name: "approved", type: "Edm.Boolean", searchable: false, filterable: true, retrievable: true, sortable: false, facetable: true },
    { name: "effectiveDate", type: "Edm.DateTimeOffset", searchable: false, filterable: true, retrievable: true, sortable: true, facetable: false },
    { name: "contentVector", type: "Collection(Edm.Single)", searchable: true, retrievable: false, dimensions: 1536, vectorSearchProfile: "vp-1" },
  ],
  vectorSearch,
};
const withField = (field: Field): IndexDefinition => ({ ...good, fields: [...good.fields, field] });
const rules = (definition: IndexDefinition) => validateIndex(definition).map((p) => `${p.path} ${p.rule}`);

test("a well-formed definition has no problems", () => {
  assert.deepEqual(validateIndex(good), []);
});

test("REST defaults: strings are searchable, filterable, sortable, facetable and retrievable unless you say otherwise", () => {
  assert.deepEqual(effectiveAttributes({ name: "s", type: "Edm.String" }), { searchable: true, filterable: true, retrievable: true, sortable: true, facetable: true });
  assert.deepEqual(effectiveAttributes({ name: "n", type: "Edm.Int32" }), { searchable: false, filterable: true, retrievable: true, sortable: true, facetable: true });
  assert.equal(effectiveAttributes({ name: "c", type: "Collection(Edm.String)" }).sortable, false);
  assert.deepEqual(effectiveAttributes({ name: "v", type: "Collection(Edm.Single)" }), { searchable: true, filterable: false, retrievable: false, sortable: false, facetable: false });
  assert.equal(effectiveAttributes({ name: "s", type: "Edm.String", filterable: false }).filterable, false, "explicit values win");
});

test("index and field names follow the naming rules", () => {
  assert.deepEqual(rules({ ...good, name: "FAQ" }), ["index index-name"]);
  assert.deepEqual(rules({ ...good, name: "faq--v1" }), ["index index-name"]);
  assert.deepEqual(rules({ ...good, name: "-faq" }), ["index index-name"]);
  assert.deepEqual(rules(withField({ name: "1title", type: "Edm.String" })), ["fields.1title field-name"]);
  assert.deepEqual(rules(withField({ name: "azureSearchScore", type: "Edm.String" })), ["fields.azureSearchScore field-name"]);
  assert.deepEqual(rules(withField({ name: "title", type: "Edm.String", sortable: false })), ["fields.title duplicate-field"]);
});

test("exactly one key, of type Edm.String, and retrievable", () => {
  assert.deepEqual(rules({ ...good, fields: good.fields.slice(1) }), ["index key-count"]);
  assert.deepEqual(rules(withField({ name: "id2", type: "Edm.String", key: true })), ["index key-count"]);
  const intKey = { ...good, fields: [{ name: "id", type: "Edm.Int32", key: true }, ...good.fields.slice(1)] };
  assert.deepEqual(rules(intKey), ["fields.id key-type"]);
  const hiddenKey = { ...good, fields: [{ ...good.fields[0], retrievable: false }, ...good.fields.slice(1)] };
  assert.deepEqual(rules(hiddenKey), ["fields.id key-retrievable"]);
});

test("only text is full-text searchable, and collections cannot be sorted", () => {
  assert.deepEqual(rules(withField({ name: "amount", type: "Edm.Double", searchable: true })), ["fields.amount searchable-type"]);
  assert.deepEqual(rules(withField({ name: "flag", type: "Edm.Boolean", searchable: true })), ["fields.flag searchable-type"]);
  assert.deepEqual(rules(withField({ name: "labels", type: "Collection(Edm.String)", sortable: true })), ["fields.labels sortable-type"]);
});

test("analyzers belong on searchable strings only", () => {
  assert.deepEqual(rules(withField({ name: "code", type: "Edm.String", searchable: false, analyzer: "keyword" })), ["fields.code analyzer-target"]);
  assert.deepEqual(rules(withField({ name: "n", type: "Edm.Int64", analyzer: "standard.lucene" })), ["fields.n analyzer-target"]);
});

test("vector fields: searchable, never filterable, sortable or facetable, with dimensions and a real profile", () => {
  const v = { name: "v2", type: "Collection(Edm.Single)", dimensions: 3, vectorSearchProfile: "vp-1" };
  assert.deepEqual(rules(withField(v)), []);
  assert.deepEqual(rules(withField({ ...v, searchable: false })), ["fields.v2 vector-searchable"]);
  assert.deepEqual(rules(withField({ ...v, filterable: true })), ["fields.v2 vector-attributes"]);
  assert.deepEqual(rules(withField({ ...v, dimensions: undefined })), ["fields.v2 vector-dimensions"]);
  assert.deepEqual(rules(withField({ ...v, dimensions: 1.5 })), ["fields.v2 vector-dimensions"]);
  assert.deepEqual(rules(withField({ ...v, dimensions: 1 })), ["fields.v2 vector-dimensions"], "the minimum is 2");
  assert.deepEqual(rules(withField({ ...v, dimensions: 2 })), []);
  assert.deepEqual(rules(withField({ ...v, vectorSearchProfile: "missing" })), ["fields.v2 vector-profile"]);
  assert.deepEqual(rules({ ...withField(v), vectorSearch: { algorithms: [], profiles: vectorSearch.profiles } }), [
    "fields.contentVector vector-profile",
    "fields.v2 vector-profile",
  ]);
  assert.deepEqual(rules(withField({ ...v, analyzer: "standard.lucene" })), ["fields.v2 analyzer-target"]);
});

test("dimensions on a non-vector field and unsupported types are reported", () => {
  assert.deepEqual(rules(withField({ name: "t", type: "Edm.String", sortable: false, dimensions: 3 })), ["fields.t dimensions-target"]);
  assert.deepEqual(rules(withField({ name: "loc", type: "Edm.GeographyPoint" })), ["fields.loc unsupported-type"]);
});
