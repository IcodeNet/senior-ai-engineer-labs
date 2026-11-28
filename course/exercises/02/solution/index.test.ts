import { test } from "vitest";
import assert from "node:assert/strict";
import { bannerFor, canClearBanner, confirmed, estimate, hoursWithinBudget, type Rates, type VerifyResult } from "./index.ts";

// Illustrative rates for the arithmetic only. They are not current prices: `npm run azure:plan` shows live list prices.
const rates: Rates = { currency: "USD", searchUnitHour: 0.1, inputPerMillion: 0.25, outputPerMillion: 2 };
const clean: VerifyResult = {
  sweptSubscription: "sub-a",
  recordedSubscription: "sub-a",
  groups: 0,
  resources: 0,
  softDeleted: 0,
  errors: false,
};

test("search cost is units × hours × rate, whether or not you query it", () => {
  const idle = estimate({ searchUnits: 1, hours: 8, inputTokens: 0, outputTokens: 0 }, rates);
  assert.deepEqual(idle, { currency: "USD", search: 0.8, tokens: 0, total: 0.8 });
  assert.equal(estimate({ searchUnits: 2, hours: 8, inputTokens: 0, outputTokens: 0 }, rates).search, 1.6);
});

test("token cost is per million, priced separately for input and output", () => {
  const result = estimate({ searchUnits: 1, hours: 2, inputTokens: 200_000, outputTokens: 150_000 }, rates);
  assert.equal(result.tokens, 0.35); // 0.05 for input + 0.30 for output
  assert.equal(result.total, 0.55);
});

test("forgetting to shut down dominates the bill", () => {
  const weekend = estimate({ searchUnits: 1, hours: 64, inputTokens: 100_000, outputTokens: 150_000 }, rates);
  assert.ok(weekend.search > 10 * weekend.tokens);
});

test("estimate rejects negative or non-numeric plans", () => {
  assert.throws(() => estimate({ searchUnits: 1, hours: -1, inputTokens: 0, outputTokens: 0 }, rates), /hours/);
  assert.throws(() => estimate({ searchUnits: Number.NaN, hours: 1, inputTokens: 0, outputTokens: 0 }, rates), /searchUnits/);
});

test("hoursWithinBudget rounds down to whole hours", () => {
  assert.equal(hoursWithinBudget(5, 1, rates), 50);
  assert.equal(hoursWithinBudget(0.99, 1, rates), 9);
  assert.throws(() => hoursWithinBudget(5, 0, rates), /positive/);
});

test("the banner shows the least certain state", () => {
  assert.deepEqual(bannerFor([]), { level: "none" });
  assert.deepEqual(bannerFor(["env.json"]), { level: "danger", reason: "exists" });
  assert.deepEqual(bannerFor(["env.json", "resources-may-exist.json"]), { level: "danger", reason: "may-exist" });
  assert.deepEqual(bannerFor(["env.json", "cost-status-unknown.json", "resources-may-exist.json"]), { level: "danger", reason: "unknown" });
  assert.deepEqual(bannerFor(["README.md"]), { level: "none" });
});

test("only a clean, error-free sweep of the recorded subscription clears the banner", () => {
  assert.equal(canClearBanner(clean), true);
  assert.equal(canClearBanner({ ...clean, softDeleted: 1 }), false, "a soft-deleted account can still block names and hold quota");
  assert.equal(canClearBanner({ ...clean, resources: 1 }), false);
  assert.equal(canClearBanner({ ...clean, groups: 1 }), false);
  assert.equal(canClearBanner({ ...clean, errors: true }), false, "a failed list is not an empty list");
  assert.equal(canClearBanner({ ...clean, sweptSubscription: "sub-b" }), false, "a clean sweep of another subscription proves nothing");
  assert.equal(canClearBanner({ ...clean, recordedSubscription: null }), false);
});

test("typed confirmations match exactly", () => {
  assert.equal(confirmed("create", "create"), true);
  assert.equal(confirmed("create", "create\n"), true);
  assert.equal(confirmed("create", "Create"), false);
  assert.equal(confirmed("create", " create"), false);
  assert.equal(confirmed("create", "y"), false);
  assert.equal(confirmed("rg-saiel-course", "rg-saiel-course\r\n"), true);
  assert.throws(() => confirmed("", ""), /empty/);
});
