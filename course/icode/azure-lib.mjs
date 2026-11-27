// Pure decision logic for the Azure lifecycle commands, unit-tested offline (icode/azure-lib.test.mjs).
import { createHash } from "node:crypto";

export function resourceGroupName(prefix, subscriptionId, owner) {
  const hash = createHash("sha256").update(`${subscriptionId}:${owner}`.toLowerCase()).digest("hex").slice(0, 6);
  return `${prefix}-${hash}`;
}

export function courseTags(courseTag, owner, now, expiresAfterHours) {
  return {
    course: courseTag,
    owner,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + expiresAfterHours * 3600_000).toISOString(),
  };
}

/** Find a deployable model version in `az cognitiveservices model list` output. */
export function checkModel(models, wanted, now, minDaysLeft = 7) {
  const match = models.find((m) => m.model?.name === wanted.name && m.model?.version === wanted.version);
  if (!match) {
    const versions = models.filter((m) => m.model?.name === wanted.name).map((m) => m.model.version);
    return { ok: false, reason: versions.length ? `version ${wanted.version} not offered here (available: ${[...new Set(versions)].join(", ")})` : `${wanted.name} is not offered in this region` };
  }
  if (!(match.model.skus ?? []).some((sku) => sku.name === wanted.sku)) return { ok: false, reason: `deployment type ${wanted.sku} not offered for ${wanted.name}` };
  const retires = match.model.deprecation?.inference;
  if (retires && Date.parse(retires) - now.getTime() < minDaysLeft * 86400_000)
    return { ok: false, reason: `${wanted.name} ${wanted.version} retires on ${retires.slice(0, 10)}` };
  return { ok: true, retires: retires ?? null };
}

/** Hourly Basic search unit price from Azure Retail Prices API items, or null when not found. */
export function searchBasicHourly(items) {
  const prices = items
    .filter((i) => i.type === "Consumption" && i.skuName === "Basic" && /hour/i.test(i.unitOfMeasure ?? "") && i.retailPrice > 0)
    .map((i) => ({ price: i.retailPrice, currency: i.currencyCode }));
  if (prices.length === 0) return null;
  return prices.sort((a, b) => a.price - b.price)[0];
}

export function estimateCost(hourly, hours) {
  return Math.round(hourly * hours * 100) / 100;
}

export function confirmed(input, expected) {
  return typeof input === "string" && input.trim() === expected;
}

export function isCourseGroup(group, courseTag) {
  return group?.tags?.course === courseTag;
}

/** Everything that still exists after shutdown and could keep a name reserved or incur charges. */
export function remainingAfterTeardown({ groupExists, taggedResources, deletedAccounts }) {
  const remaining = [];
  if (groupExists) remaining.push("resource group still exists");
  for (const resource of taggedResources) remaining.push(`resource ${resource.type} ${resource.name}`);
  for (const account of deletedAccounts) remaining.push(`soft-deleted account ${account.name} (not purged)`);
  return remaining;
}
