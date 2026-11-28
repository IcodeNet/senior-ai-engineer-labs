import { test } from "vitest";
import assert from "node:assert/strict";
import type { Field } from "./schema.ts";
import { tokenizeFilter } from "./odata.ts";
import { escapeODataString, governanceFilter, requiredQueryType, validateFilter, withGovernance } from "./index.ts";

const common: Field[] = [
  { name: "id", type: "Edm.String", key: true, searchable: false, filterable: true },
  { name: "chunk", type: "Edm.String", searchable: true, filterable: false, sortable: false, facetable: false },
  { name: "category", type: "Edm.String", searchable: false, filterable: true },
  { name: "effectiveDate", type: "Edm.DateTimeOffset", filterable: true },
  { name: "expiryDate", type: "Edm.DateTimeOffset", filterable: true },
  { name: "tags", type: "Collection(Edm.String)", filterable: true },
  { name: "contentVector", type: "Collection(Edm.Single)", searchable: true, dimensions: 3, vectorSearchProfile: "p" },
];
const statusSchema: Field[] = [...common, { name: "status", type: "Edm.String", searchable: false, filterable: true }];
const approvedSchema: Field[] = [...common, { name: "approved", type: "Edm.Boolean", filterable: true }];
const rules = (filter: string, fields: Field[]) => validateFilter(filter, fields).map((p) => p.rule);

test("simple syntax covers terms, phrases, + | - operators and prefix search such as chem*", () => {
  for (const search of ["chem*", "card refund", '"lost card" +freeze', "overdraft -fee", "motel+(wifi|luxury)", "*", "ERR-4021"])
    assert.equal(requiredQueryType(search), "simple", search);
});

test("full Lucene is needed for infix wildcards, ?, fuzzy, proximity, regex, fielded search, boosts and AND/OR/NOT", () => {
  for (const search of ["non*al", "c?rd", "refnud~", "refnud~1", '"card fee"~3', "/.*numeric/", "title:refund", "refund^3", "card AND refund", "card && refund"])
    assert.equal(requiredQueryType(search), "full", search);
  assert.equal(requiredQueryType("card\\*s"), "simple", "an escaped operator is just a character");
  assert.equal(requiredQueryType('"title: refund"'), "simple", "a colon inside a phrase is not fielded search");
});

test("escapeODataString doubles embedded quotes, so user input stays a single literal", () => {
  assert.equal(escapeODataString("O'Brien"), "'O''Brien'");
  const attack = `cards' or status eq 'draft`;
  const tokens = tokenizeFilter(`category eq ${escapeODataString(attack)}`);
  assert.deepEqual(tokens.map((t) => t.kind), ["field", "op", "string"]);
  assert.equal(tokens[2].value, attack);
});

test("governanceFilter depends on the schema design: a Boolean field or a status string", () => {
  assert.equal(
    governanceFilter("approved", "2026-11-28"),
    "approved eq true and effectiveDate le 2026-11-28T00:00:00Z and (expiryDate eq null or expiryDate ge 2026-11-28T00:00:00Z)",
  );
  assert.equal(
    governanceFilter("status", "2026-11-28"),
    "status eq 'approved' and effectiveDate le 2026-11-28T00:00:00Z and (expiryDate eq null or expiryDate ge 2026-11-28T00:00:00Z)",
  );
  assert.throws(() => governanceFilter("status", "28/11/2026"), /YYYY-MM-DD/);
});

test("each governance filter is valid only against its own schema design", () => {
  assert.deepEqual(rules(governanceFilter("status", "2026-11-28"), statusSchema), []);
  assert.deepEqual(rules(governanceFilter("approved", "2026-11-28"), approvedSchema), []);
  assert.deepEqual(rules("approved eq true", statusSchema), ["unknown-field"]);
  assert.deepEqual(rules("status eq 'approved'", approvedSchema), ["unknown-field"]);
  assert.deepEqual(rules("approved eq 'true'", approvedSchema), ["type-mismatch"], "a quoted 'true' is a string, not a Boolean");
  assert.deepEqual(rules("status eq true", statusSchema), ["type-mismatch"]);
});

test("withGovernance parenthesises the caller filter so 'or' cannot widen the result", () => {
  const combined = withGovernance("category eq 'cards' or category eq 'loans'", "status", "2026-11-28");
  assert.equal(combined, `(${governanceFilter("status", "2026-11-28")}) and (category eq 'cards' or category eq 'loans')`);
  assert.deepEqual(rules(combined, statusSchema), []);
  assert.equal(withGovernance(undefined, "status", "2026-11-28"), governanceFilter("status", "2026-11-28"));
  assert.equal(withGovernance("   ", "status", "2026-11-28"), governanceFilter("status", "2026-11-28"));
});

test("validateFilter reports fields that are missing or not filterable", () => {
  assert.deepEqual(rules("chunk eq 'refund'", statusSchema), ["not-filterable"], "chunk is searchable text, not a filter field");
  assert.deepEqual(rules("contentVector eq 1", statusSchema), ["not-filterable"]);
  assert.deepEqual(rules("owner eq 'ops'", statusSchema), ["unknown-field"]);
});

test("validateFilter checks literal types and Boolean operators", () => {
  assert.deepEqual(rules("effectiveDate le '2026-11-28'", statusSchema), ["type-mismatch"], "DateTimeOffset literals are not quoted");
  assert.deepEqual(rules("effectiveDate le 2026-11-28T00:00:00Z", statusSchema), []);
  assert.deepEqual(rules("approved gt false", approvedSchema), ["type-mismatch"]);
  assert.deepEqual(rules("approved", approvedSchema), [], "a Boolean field can stand alone");
  assert.deepEqual(rules("category", statusSchema), ["type-mismatch"]);
  assert.deepEqual(rules("tags eq 'x'", statusSchema), ["type-mismatch"], "collections need any/all");
  assert.deepEqual(rules("expiryDate eq null", statusSchema), []);
});

test("validateFilter rejects bad syntax, including not without parentheses", () => {
  assert.deepEqual(rules("not status eq 'approved'", statusSchema), ["syntax"]);
  assert.deepEqual(rules("not (status eq 'approved')", statusSchema), []);
  assert.deepEqual(rules("status eq 'approved' and", statusSchema), ["syntax"]);
  assert.deepEqual(rules("(status eq 'approved'", statusSchema), ["syntax"]);
  assert.deepEqual(rules("status eq 'approved", statusSchema), ["syntax"]);
  assert.deepEqual(rules("search.in(category, 'a,b')", statusSchema), ["syntax"]);
  assert.deepEqual(rules("", statusSchema), ["syntax"]);
});
