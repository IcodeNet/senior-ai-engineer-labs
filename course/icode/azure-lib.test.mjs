import { describe, expect, test } from "vitest";
import { COST_MARKERS, checkModel, chooseTarget, confirmChannel, confirmLine, confirmed, lostStateMarker, markerChanges, modelMeters, preAnswered, resolveRecord, courseTags, estimateCost, isCourseGroup, remainingAfterTeardown, resourceGroupName, searchBasicHourly } from "./azure-lib.mjs";

const now = new Date("2026-11-27T12:00:00Z");
const SUB = "00000000-0000-0000-0000-00000000c0de";
const OTHER = "00000000-0000-0000-0000-0000000000ff";
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
      { type: "Consumption", skuName: "Basic", meterName: "Basic Unit", unitOfMeasure: "1 Hour", retailPrice: 0.11, currencyCode: "USD" },
      { type: "Consumption", skuName: "Basic", meterName: "Basic Semantic Ranker", unitOfMeasure: "1 Hour", retailPrice: 0.01, currencyCode: "USD" },
      { type: "Reservation", skuName: "Basic", unitOfMeasure: "1 Hour", retailPrice: 0.05, currencyCode: "USD" },
    ];
    expect(searchBasicHourly(items)).toEqual({ price: 0.11, currency: "USD", meter: "Basic Unit" });
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
      remainingAfterTeardown({ groupExists: true, group: "rg-a", taggedGroups: ["rg-a", "rg-b"], taggedResources: [{ type: "Microsoft.Search/searchServices", name: "s" }], deletedAccounts: [{ name: "oai" }] }),
    ).toEqual(["resource group rg-a still exists", "course-tagged resource group rg-b", "resource Microsoft.Search/searchServices s", "soft-deleted account oai (not purged)"]);
  });

  test("confirmations come from the Icode engine with its token, or an interactive terminal, never from a pipe", () => {
    expect(confirmChannel({ action: "1", token: "0123456789abcdef0123", isTTY: false })).toBe("icode");
    expect(confirmChannel({ action: undefined, token: "0123456789abcdef0123", isTTY: false })).toBe("none");
    expect(confirmChannel({ action: "1", token: "", isTTY: false })).toBe("none");
    expect(confirmChannel({ action: "1", token: "short", isTTY: true })).toBe("terminal");
    expect(confirmChannel({ action: undefined, token: undefined, isTTY: true })).toBe("terminal");
    expect(confirmLine("abc", "create", "Billable.")).toBe('::icode-confirm:abc::{"expected":"create","message":"Billable."}');
  });

  test("cost markers fail closed: only a clean check clears them", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    expect(markerChanges({ kind: "zero" })).toEqual({ write: {}, remove: Object.values(COST_MARKERS) });
    expect(markerChanges({ kind: "remaining", items: ["x"], subscriptionId: SUB }, now)).toEqual({
      write: { [COST_MARKERS.mayExist]: { reason: "course resources found", items: ["x"], subscriptionId: SUB, checkedAt: now.toISOString() } },
      remove: [COST_MARKERS.unknown],
    });
    expect(markerChanges({ kind: "unknown", reason: "Not signed in", subscriptionId: SUB }, now)).toEqual({
      write: { [COST_MARKERS.unknown]: { reason: "Not signed in", subscriptionId: SUB, checkedAt: now.toISOString() } },
      remove: [],
    });
  });

  test("recorded state needs one readable subscription, or it is a problem", () => {
    const src = (name, value, extra = {}) => ({ name, exists: true, value, ...extra });
    expect(resolveRecord([{ name: "a", exists: false }])).toEqual({ anyState: false, subscriptionId: undefined, resourceGroup: undefined });
    expect(resolveRecord([src("env", { subscriptionId: SUB.toUpperCase(), resourceGroup: "rg-a" }), src("outside", { subscriptionId: SUB })])).toEqual({ anyState: true, subscriptionId: SUB, resourceGroup: "rg-a" });
    expect(resolveRecord([src("env", undefined, { corrupt: true })]).problem).toMatch(/env cannot be read/);
    expect(resolveRecord([src("env", { resourceGroup: "rg-a" })]).problem).toMatch(/does not say which subscription/);
    expect(resolveRecord([src("unknown", { reason: "x" })]).problem).toMatch(/does not say which subscription/);
    expect(resolveRecord([src("env", { subscriptionId: "not-a-guid" })]).problem).toMatch(/does not say which subscription/);
    expect(resolveRecord([src("a", { subscriptionId: SUB }), src("b", { subscriptionId: OTHER })]).problem).toMatch(/several subscriptions/);
  });

  test("the target is the recorded subscription and group, never a guess", () => {
    const opts = { signedIn: SUB, computedGroup: "rg-computed" };
    expect(chooseTarget({ anyState: false }, opts)).toEqual({ subscriptionId: SUB, group: "rg-computed", recorded: false, groupRecorded: false });
    expect(chooseTarget({ anyState: true, subscriptionId: SUB, resourceGroup: "rg-a" }, opts)).toEqual({ subscriptionId: SUB, group: "rg-a", recorded: true, groupRecorded: true });
    expect(() => chooseTarget({ anyState: true, subscriptionId: OTHER }, opts)).toThrow(/az account set --subscription/);
    expect(() => chooseTarget({ anyState: true, problem: "env cannot be read" }, opts)).toThrow(/azure:verify -- --subscription/);
    // An explicit choice resolves an unreadable record, but only for the signed-in subscription.
    expect(chooseTarget({ anyState: true, problem: "x" }, { ...opts, explicit: SUB }).recorded).toBe(true);
    expect(() => chooseTarget({ anyState: true, problem: "x" }, { ...opts, explicit: OTHER })).toThrow(/not the signed-in subscription/);
    expect(() => chooseTarget({ anyState: true, subscriptionId: OTHER }, { ...opts, signedIn: SUB, explicit: SUB })).toThrow(/recorded state names subscription/);
    expect(() => chooseTarget({ anyState: false }, { ...opts, explicit: "" })).toThrow(/needs a subscription ID/);
  });

  test("a lost course/.azure is restored as Cost status unknown from the outside record", () => {
    expect(lostStateMarker({ exists: false }, false)).toBeUndefined();
    expect(lostStateMarker({ exists: true, value: { subscriptionId: SUB } }, true)).toBeUndefined();
    expect(lostStateMarker({ exists: true, path: "/cfg/x.json", value: { subscriptionId: SUB, resourceGroup: "rg-a" } }, false)).toEqual({
      reason: "course/.azure was removed, but Lab 03 set-up recorded resources (record: /cfg/x.json)",
      subscriptionId: SUB,
      resourceGroup: "rg-a",
    });
    expect(lostStateMarker({ exists: true, path: "/cfg/x.json", corrupt: true }, false).reason).toMatch(/cannot be read/);
    expect(preAnswered({ bytesBeforePrompt: 0 })).toBe(false);
    expect(preAnswered({ bytesBeforePrompt: 7 })).toBe(true);
  });

  test("token meters are matched by model name across naming styles", () => {
    const items = [
      { type: "Consumption", meterName: "gpt 5 mini Inp glbl Tokens", unitOfMeasure: "1M", retailPrice: 0.25, currencyCode: "USD", armRegionName: "Global" },
      { type: "Consumption", meterName: "gpt-5-mini-Outp-glbl", unitOfMeasure: "1M", retailPrice: 2, currencyCode: "USD", armRegionName: "Global" },
      { type: "Consumption", meterName: "gpt 5 Inp glbl Tokens", unitOfMeasure: "1M", retailPrice: 1.25, currencyCode: "USD", armRegionName: "Global" },
      { type: "Consumption", meterName: "gpt 5 mini Inp glbl Tokens", unitOfMeasure: "1M", retailPrice: 0.25, currencyCode: "USD", armRegionName: "Global" },
      { type: "Consumption", meterName: "GPT5 Mini cached Inp", unitOfMeasure: "1M", retailPrice: 0.03, currencyCode: "USD", armRegionName: "swedencentral" },
      { type: "Consumption", meterName: "gpt 5 mini Inp glbl Tokens", unitOfMeasure: "1M", retailPrice: 0.3, currencyCode: "USD", armRegionName: "eastus" },
      { type: "Consumption", meterName: "o4 mini Inp", unitOfMeasure: "1M", retailPrice: 1, currencyCode: "USD", armRegionName: "swedencentral" },
    ];
    expect(modelMeters(items, "gpt-5-mini", "swedencentral").map((m) => m.meter).sort()).toEqual(["GPT5 Mini cached Inp", "gpt 5 mini Inp glbl Tokens", "gpt-5-mini-Outp-glbl"]);
  });
});
