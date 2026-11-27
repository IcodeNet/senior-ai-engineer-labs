import { test } from "vitest";
import assert from "node:assert/strict";
import { authorizeResults, buildSecurityFilter, canRead, type Principal, type SecuredDocument } from "./index.ts";

// Synthetic tenants: two banks sharing one multi-tenant assistant.
const analyst: Principal = { userId: "u-ana", tenantId: "northbank", groups: ["credit-risk", "all-staff"], clearance: "confidential" };
const doc = (id: string, over: Partial<SecuredDocument> = {}): SecuredDocument => ({
  id,
  tenantId: "northbank",
  classification: "internal",
  acl: { groups: ["all-staff"] },
  ...over,
});

test("a listed group in the same tenant with enough clearance can read", () => {
  assert.deepEqual(canRead(analyst, doc("expenses")), { allow: true });
  assert.deepEqual(canRead(analyst, doc("memo", { acl: { users: ["u-ana"] }, classification: "confidential" })), { allow: true });
});

test("another tenant's document is denied even when the group name matches", () => {
  assert.deepEqual(canRead(analyst, doc("rival", { tenantId: "southbank" })), { allow: false, reason: "tenant" });
});

test("deny by default: missing or empty ACLs grant nothing", () => {
  assert.deepEqual(canRead(analyst, doc("orphan", { acl: undefined })), { allow: false, reason: "no-acl" });
  assert.deepEqual(canRead(analyst, doc("empty", { acl: { users: [], groups: [] } })), { allow: false, reason: "no-acl" });
  assert.deepEqual(canRead(analyst, doc("other", { acl: { groups: ["treasury"] } })), { allow: false, reason: "not-listed" });
});

test("classification above the principal's clearance is denied", () => {
  assert.deepEqual(canRead(analyst, doc("mna", { classification: "restricted" })), { allow: false, reason: "clearance" });
});

test("the search filter scopes tenant, ACL and clearance and escapes quotes", () => {
  const filter = buildSecurityFilter({ userId: "o'neil", tenantId: "northbank", groups: ["treasury", "all-staff"], clearance: "internal" });
  assert.equal(
    filter,
    "tenantId eq 'northbank' and (aclUsers/any(u: u eq 'o''neil') or aclGroups/any(g: g eq 'all-staff') or aclGroups/any(g: g eq 'treasury')) and (classification eq 'public' or classification eq 'internal')",
  );
  assert.throws(() => buildSecurityFilter({ ...analyst, tenantId: "" }));
});

test("post-filtering drops what a misconfigured index returned and records why", () => {
  const result = authorizeResults(analyst, [doc("ok"), doc("rival", { tenantId: "southbank" }), doc("mna", { classification: "restricted" })]);
  assert.deepEqual(result.allowed.map((d) => d.id), ["ok"]);
  assert.deepEqual(result.denied, [
    { id: "rival", reason: "tenant" },
    { id: "mna", reason: "clearance" },
  ]);
});
