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

/** Hourly Basic search unit price from Azure Retail Prices API items, or null when not found. Only the search-unit meter counts. */
export function searchBasicHourly(items) {
  const prices = items
    .filter((i) => i.type === "Consumption" && i.skuName === "Basic" && /\bunit\b/i.test(i.meterName ?? "") && /hour/i.test(i.unitOfMeasure ?? "") && i.retailPrice > 0)
    .map((i) => ({ price: i.retailPrice, currency: i.currencyCode, meter: i.meterName }));
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
export function remainingAfterTeardown({ groupExists, group, taggedGroups = [], taggedResources, deletedAccounts }) {
  const remaining = [];
  if (groupExists) remaining.push(`resource group ${group ?? ""} still exists`.replace("  ", " "));
  for (const name of taggedGroups) if (!(groupExists && name.toLowerCase() === (group ?? "").toLowerCase())) remaining.push(`course-tagged resource group ${name}`);
  for (const resource of taggedResources) remaining.push(`resource ${resource.type} ${resource.name}`);
  for (const account of deletedAccounts) remaining.push(`soft-deleted account ${account.name} (not purged)`);
  return remaining;
}

// ---- Icode Workshop course actions -------------------------------------------------------------
// The engine runs `npm run azure:*` from the Actions tab with a random per-run ICODE_CONFIRM_TOKEN and
// opens a typed-confirmation dialog only for protocol lines that carry that token.

export const CONFIRM_TAG = "::icode-confirm";

/** The protocol line that asks the Icode UI for a typed confirmation. */
export function confirmLine(token, expected, message) {
  return `${CONFIRM_TAG}:${token}::${JSON.stringify({ expected, message })}`;
}

/**
 * Where a typed confirmation may come from: the Icode engine (an action run with its token), an
 * interactive terminal, or nowhere. Piped or scripted input is never accepted as a confirmation.
 */
export function confirmChannel({ action, token, isTTY }) {
  if (action === "1" && typeof token === "string" && /^[A-Za-z0-9_-]{16,}$/.test(token)) return "icode";
  if (isTTY) return "terminal";
  return "none";
}

/** Marker files under the course root that drive the Icode cost banners (course.json `indicators`). */
export const COST_MARKERS = {
  env: ".azure/env.json",
  mayExist: ".azure/resources-may-exist.json",
  unknown: ".azure/cost-status-unknown.json",
};

/**
 * Marker changes after an Azure state check. Fails closed: only a successful check in the subscription
 * the resources were created in can clear a banner.
 * state: { kind: "unknown", reason, ...known } | { kind: "remaining", items, ...known } | { kind: "zero" }
 */
export function markerChanges(state, now = new Date()) {
  const { kind, ...detail } = state;
  if (kind === "zero") return { write: {}, remove: [COST_MARKERS.env, COST_MARKERS.mayExist, COST_MARKERS.unknown] };
  if (kind === "remaining") return { write: { [COST_MARKERS.mayExist]: { reason: "course resources found", ...detail, checkedAt: now.toISOString() } }, remove: [COST_MARKERS.unknown] };
  return { write: { [COST_MARKERS.unknown]: { ...detail, reason: detail.reason || "Azure state could not be checked", checkedAt: now.toISOString() } }, remove: [] };
}

const SUBSCRIPTION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What earlier runs recorded, from every state source (course/.azure markers and the copy outside the
 * checkout). Fails closed: any state without one readable, consistent subscription is a problem.
 * sources: [{ name, exists, value?, corrupt? }]
 */
export function resolveRecord(sources) {
  const present = sources.filter((s) => s.exists);
  const ids = [...new Set(present.map((s) => s.value?.subscriptionId).filter((id) => typeof id === "string" && SUBSCRIPTION_ID.test(id)).map((id) => id.toLowerCase()))];
  const groups = [...new Set(present.map((s) => s.value?.resourceGroup).filter((g) => typeof g === "string" && g))];
  const record = { anyState: present.length > 0, subscriptionId: ids.length === 1 ? ids[0] : undefined, resourceGroup: groups.length === 1 ? groups[0] : undefined };
  const corrupt = present.filter((s) => s.corrupt).map((s) => s.name);
  if (corrupt.length) record.problem = `${corrupt.join(", ")} cannot be read`;
  else if (ids.length > 1) record.problem = `the recorded state names several subscriptions (${ids.join(", ")})`;
  else if (groups.length > 1) record.problem = `the recorded state names several resource groups (${groups.join(", ")})`;
  else if (record.anyState && !record.subscriptionId) record.problem = `the recorded state (${present.map((s) => s.name).join(", ")}) does not say which subscription was used`;
  return record;
}

/**
 * The subscription and resource group a state-changing or state-clearing command may act on.
 * Throws (the caller records "Cost status unknown") instead of guessing.
 */
export function chooseTarget(record, { signedIn, explicit, computedGroup }) {
  const current = signedIn.toLowerCase();
  if (explicit !== undefined) {
    if (!SUBSCRIPTION_ID.test(explicit)) throw new Error(`--subscription needs a subscription ID, got "${explicit}"`);
    if (explicit.toLowerCase() !== current) throw new Error(`--subscription ${explicit} is not the signed-in subscription ${signedIn}. Run \`az account set --subscription ${explicit}\` first`);
    if (record.subscriptionId && record.subscriptionId !== current) throw new Error(`the recorded state names subscription ${record.subscriptionId}, not ${explicit}`);
    return { subscriptionId: current, group: record.resourceGroup ?? computedGroup, recorded: true, groupRecorded: Boolean(record.resourceGroup) };
  }
  if (record.problem)
    throw new Error(`Cannot tell which subscription Lab 03 used: ${record.problem}. Sign in to the subscription you used (\`az account set --subscription <id>\`), then from course/ run \`npm run azure:verify -- --subscription <id>\` to sweep it for course-tagged resources`);
  if (record.subscriptionId && record.subscriptionId !== current)
    throw new Error(`Course resources were recorded in subscription ${record.subscriptionId}, but you are signed in to ${signedIn}. Run \`az account set --subscription ${record.subscriptionId}\` and try again`);
  return { subscriptionId: current, group: record.resourceGroup ?? computedGroup, recorded: Boolean(record.subscriptionId), groupRecorded: Boolean(record.resourceGroup) };
}

/** After `.azure/` is lost, the record kept outside the checkout must bring a banner back. */
export function lostStateMarker(durable, markersPresent) {
  if (!durable.exists || markersPresent) return undefined;
  return {
    reason: durable.corrupt
      ? `the Lab 03 state record outside the course (${durable.path}) cannot be read`
      : `course/.azure was removed, but Lab 03 set-up recorded resources (record: ${durable.path})`,
    subscriptionId: durable.value?.subscriptionId,
    resourceGroup: durable.value?.resourceGroup,
  };
}

/** Confirmation text that reached stdin before the prompt was shown is a pre-answer, never a confirmation. */
export function preAnswered({ bytesBeforePrompt }) {
  return bytesBeforePrompt > 0;
}

/** Pay-per-token meters for a model from Azure Retail Prices API items (names vary: "gpt-5-mini", "gpt 5 mini", "GPT5 Mini"). */
export function modelMeters(items, modelName, region) {
  const squash = (s) => (s ?? "").toLowerCase().replace(/[-\s._]+/g, "");
  const wanted = squash(modelName);
  const inRegion = (r) => !region || ["", "global", region.toLowerCase()].includes((r ?? "").toLowerCase());
  const seen = new Set();
  return items
    .filter((i) => i.type === "Consumption" && i.retailPrice > 0 && squash(i.meterName).includes(wanted) && inRegion(i.armRegionName))
    .map((i) => ({ meter: i.meterName, unit: i.unitOfMeasure, price: i.retailPrice, currency: i.currencyCode, region: i.armRegionName, product: i.productName }))
    .filter((m) => {
      const key = `${m.meter}|${m.region}|${m.unit}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.meter.localeCompare(b.meter));
}
