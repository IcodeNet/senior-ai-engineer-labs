import { describe, expect, test } from "vitest";
import { checkModel, confirmed, courseTags, estimateCost, isCourseGroup, remainingAfterTeardown, resourceGroupName, searchBasicHourly } from "./azure-lib.mjs";

const now = new Date("2026-11-27T12:00:00Z");
const model = (name, version, skus, inference) => ({ model: { name, version, skus: skus.map((s) => ({ name: s })), deprecation: inference ? { inference } : undefined } });

describe("azure lifecycle decisions", () => {
  test("resource group names are stable per subscription and owner", () => {
    const a = resourceGroupName("rg-saiel-course", "sub-1", "Ann@Example.com");
    expect(a).toMatch(/^rg-saiel-course-[0-9a-f]{6}$/);
    expect(resourceGroupName("rg-saiel-course", "SUB-1", "ann@example.com")).toBe(a);
    expect(resourceGroupName("rg-saiel-course", "sub-2", "ann@example.com")).not.toBe(a);
  });

  test("tags identify the course and an expiry", () => {
    expect(courseTags("senior-ai-engineer-labs", "ann", now, 48)).toEqual({
      course: "senior-ai-engineer-labs",
      owner: "ann",
      createdAt: "2026-11-27T12:00:00.000Z",
      expiresAt: "2026-11-29T12:00:00.000Z",
    });
  });

  test("models must exist in the region, with the deployment type, and not retire soon", () => {
    const list = [model("gpt-5-mini", "2025-08-07", ["GlobalStandard"], "2027-08-01T00:00:00Z"), model("old", "1", ["Standard"], "2026-11-30T00:00:00Z")];
    expect(checkModel(list, { name: "gpt-5-mini", version: "2025-08-07", sku: "GlobalStandard" }, now)).toEqual({ ok: true, retires: "2027-08-01T00:00:00Z" });
    expect(checkModel(list, { name: "gpt-5-mini", version: "2024-01-01", sku: "GlobalStandard" }, now).reason).toMatch(/available: 2025-08-07/);
    expect(checkModel(list, { name: "gpt-5-mini", version: "2025-08-07", sku: "Standard" }, now).ok).toBe(false);
    expect(checkModel(list, { name: "old", version: "1", sku: "Standard" }, now).reason).toMatch(/retires on 2026-11-30/);
    expect(checkModel(list, { name: "missing", version: "1", sku: "Standard" }, now).reason).toMatch(/not offered in this region/);
  });

  test("the Basic hourly price is read from retail price items", () => {
    const items = [
      { type: "Consumption", skuName: "Standard S1", unitOfMeasure: "1 Hour", retailPrice: 0.33, currencyCode: "USD" },
      { type: "Consumption", skuName: "Basic", unitOfMeasure: "1 Hour", retailPrice: 0.11, currencyCode: "USD" },
      { type: "Reservation", skuName: "Basic", unitOfMeasure: "1 Hour", retailPrice: 0.05, currencyCode: "USD" },
    ];
    expect(searchBasicHourly(items)).toEqual({ price: 0.11, currency: "USD" });
    expect(searchBasicHourly([])).toBeNull();
    expect(estimateCost(0.11, 30)).toBe(3.3);
  });

  test("destructive steps need an exact typed confirmation and a course-tagged group", () => {
    expect(confirmed(" create\n", "create")).toBe(true);
    expect(confirmed("yes", "create")).toBe(false);
    expect(confirmed(undefined, "create")).toBe(false);
    expect(isCourseGroup({ tags: { course: "senior-ai-engineer-labs" } }, "senior-ai-engineer-labs")).toBe(true);
    expect(isCourseGroup({ tags: { course: "other" } }, "senior-ai-engineer-labs")).toBe(false);
    expect(isCourseGroup({}, "senior-ai-engineer-labs")).toBe(false);
  });

  test("teardown verification lists everything that remains", () => {
    expect(remainingAfterTeardown({ groupExists: false, taggedResources: [], deletedAccounts: [] })).toEqual([]);
    expect(
      remainingAfterTeardown({ groupExists: true, taggedResources: [{ type: "Microsoft.Search/searchServices", name: "s" }], deletedAccounts: [{ name: "oai" }] }),
    ).toEqual(["resource group still exists", "resource Microsoft.Search/searchServices s", "soft-deleted account oai (not purged)"]);
  });
});
