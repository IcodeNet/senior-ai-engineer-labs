#!/usr/bin/env node
// Lab 03 Azure lifecycle: prices | plan | up | status | down | verify | watch. Uses the Azure CLI (`az login` first).
// Runs from the Icode Workshop Actions tab (typed confirmations through the engine's per-run token) or a terminal.
// Nothing is created or deleted without a typed confirmation; shutdown deletes only course-tagged resource groups.
//
// Cost state fails closed. Marker files in course/.azure/ drive the Icode cost banners (course.json `indicators`), and a
// copy of the record lives outside the checkout so losing course/.azure/ brings back a "Cost status unknown" banner
// (the `watch` sidecar and every command restore it). Only a verify whose sweep is empty in the recorded subscription
// clears them.
//
// Threat model for confirmations: the learner's own machine is trusted. The checks stop accidental and automated
// pre-answering (piped input, a confirmation sent before the question); they cannot stop a program on the same
// machine that deliberately imitates Icode.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  COST_MARKERS,
  checkModel,
  chooseTarget,
  confirmChannel,
  confirmLine,
  confirmed,
  courseTags,
  estimateCost,
  isCourseGroup,
  lostStateMarker,
  markerChanges,
  modelMeters,
  preAnswered,
  remainingAfterTeardown,
  resolveRecord,
  resourceGroupName,
  searchBasicHourly,
} from "./azure-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "azure/config.json"), "utf8"));
const envFile = join(root, COST_MARKERS.env);
const command = process.argv[2];
const explicitSubscription = (() => {
  const i = process.argv.indexOf("--subscription");
  return i > 0 ? (process.argv[i + 1] ?? "") : undefined;
})();
// The record outside the checkout, shared by every clone of this course on this machine.
const stateHome = process.platform === "win32" ? process.env.APPDATA || join(homedir(), "AppData", "Roaming") : process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
const durableFile = join(stateHome, "icode-workshop", `${config.courseTag}-azure.json`);

// The confirmation token belongs to this process only: keep it out of the environment `az` inherits.
const channel = confirmChannel({ action: process.env.ICODE_ACTION, token: process.env.ICODE_CONFIRM_TOKEN, isTTY: Boolean(process.stdin.isTTY) });
const token = process.env.ICODE_CONFIRM_TOKEN;
delete process.env.ICODE_CONFIRM_TOKEN;
// One line reader for every confirmation in a run (shutdown may ask once per resource group). Anything that reaches
// stdin while no question is pending is a pre-answer and makes the next confirmation fail.
let bytesUnasked = 0;
let pending = null; // resolve function of the question being asked
let stdinClosed = false;
const queued = [];
let lines;
if (channel !== "none" && ["up", "down"].includes(command)) {
  if (channel === "icode")
    process.stdin.on("data", (chunk) => {
      if (!pending) bytesUnasked += chunk.length;
    });
  lines = createInterface({ input: process.stdin });
  lines.on("line", (line) => {
    if (pending) {
      const done = pending;
      pending = null;
      done(line);
    } else queued.push(line);
  });
  lines.on("close", () => {
    stdinClosed = true;
    if (pending) pending("");
    pending = null;
  });
}
// Commands that check Azure state record "cost status unknown" when the check fails.
let recordUnknownOnFailure = false;
let knownTarget = {};

function az(args, { json = true, allowFail = false } = {}) {
  const result = spawnSync("az", json ? [...args, "-o", "json"] : args, { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
  if (result.error?.code === "ENOENT") fail("Azure CLI not found. Install it from https://aka.ms/azure-cli, then sign in with `az login`.");
  if (result.status !== 0) {
    if (allowFail) return undefined;
    fail(`az ${args.join(" ")} failed:\n${(result.stderr || result.stdout).trim()}`);
  }
  return json ? JSON.parse(result.stdout || "null") : result.stdout.trim();
}
function fail(message) {
  if (recordUnknownOnFailure) {
    if (!knownTarget.subscriptionId) {
      const record = resolveRecord(stateSources()); // e.g. signed out before the target was chosen
      knownTarget = { ...(record.subscriptionId && { subscriptionId: record.subscriptionId }), ...(record.resourceGroup && { resourceGroup: record.resourceGroup }) };
    }
    applyMarkers(markerChanges({ kind: "unknown", reason: message.split("\n")[0], ...knownTarget }));
    message += "\nThe Icode banner shows “Cost status unknown” until “Verify cost is zero” succeeds.";
  }
  console.error(`\n✖ ${message}`);
  process.exit(1);
}
function cancel(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function readJson(path) {
  if (!existsSync(path)) return { exists: false };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? { exists: true, value } : { exists: true, corrupt: true };
  } catch {
    return { exists: true, corrupt: true };
  }
}
const readMarker = (path) => readJson(join(root, path)).value;
function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
const writeMarker = (path, value) => writeJson(join(root, path), value);
function applyMarkers({ write, remove }) {
  for (const path of remove) rmSync(join(root, path), { force: true });
  for (const [path, value] of Object.entries(write)) writeMarker(path, value);
}
/** Resources may exist: banner marker first, then the record outside the checkout. */
function recordMayExist(detail) {
  writeMarker(COST_MARKERS.mayExist, { ...readMarker(COST_MARKERS.mayExist), ...detail });
  writeJson(durableFile, { courseRoot: root, ...readJson(durableFile).value, subscriptionId: detail.subscriptionId, resourceGroup: detail.resourceGroup, updatedAt: new Date().toISOString() });
}
/** A clean verify: drop the record outside the checkout first, so nothing can restore a banner mid-way. */
function clearAllState() {
  rmSync(durableFile, { force: true });
  applyMarkers(markerChanges({ kind: "zero" }));
  rmSync(join(root, ".azure"), { recursive: true, force: true });
}
function stateSources() {
  return [
    { name: "course/.azure/env.json", ...readJson(join(root, COST_MARKERS.env)) },
    { name: "course/.azure/resources-may-exist.json", ...readJson(join(root, COST_MARKERS.mayExist)) },
    { name: "course/.azure/cost-status-unknown.json", ...readJson(join(root, COST_MARKERS.unknown)) },
    { name: durableFile, ...readJson(durableFile) },
  ];
}
/** If course/.azure/ was lost while the outside record says resources may exist, bring back a banner. */
function restoreLostState() {
  const markersPresent = Object.values(COST_MARKERS).some((path) => existsSync(join(root, path)));
  const marker = lostStateMarker({ path: durableFile, ...readJson(durableFile) }, markersPresent);
  if (!marker) return false;
  applyMarkers(markerChanges({ kind: "unknown", ...marker }));
  return true;
}

/** One typed confirmation: from the Icode dialog (token), a terminal prompt, or refused. */
async function ask(expected, message) {
  if (channel === "none") cancel("✖ A typed confirmation is required and cannot be piped. Run this from the Icode Workshop Actions tab or an interactive terminal. Nothing was changed.");
  // Let any input already waiting on stdin arrive (the event loop is blocked while az runs) before deciding.
  if (channel === "icode") await new Promise((done) => setTimeout(done, 250));
  if (channel === "icode" && (preAnswered({ bytesBeforePrompt: bytesUnasked }) || queued.length))
    cancel("✖ Input arrived before the confirmation was asked for, so it is not a confirmation. Confirm in the Icode dialog when it opens. Nothing more was changed.");
  if (channel === "terminal") queued.length = 0; // type-ahead in a terminal is discarded, never used as an answer
  if (channel === "icode") console.log(confirmLine(token, expected, message));
  else process.stdout.write(`\n${message}\nType ${expected} to continue (anything else cancels): `);
  if (stdinClosed) return "";
  return new Promise((done) => (pending = done));
}

function context() {
  const account = az(["account", "show"], { allowFail: true });
  if (!account) fail("Not signed in to Azure. Run `az login` (and `az account set --subscription <id>` if you have several), then try again.");
  const owner = account.user?.name ?? "unknown";
  return { account, owner, computedGroup: resourceGroupName(config.resourceGroupPrefix, account.id, owner), region: config.region };
}
/** Subscription and resource group from the recorded state, never guessed (see chooseTarget). */
function target(ctx, { explicit } = {}) {
  const record = resolveRecord(stateSources());
  knownTarget = { ...(record.subscriptionId && { subscriptionId: record.subscriptionId }), ...(record.resourceGroup && { resourceGroup: record.resourceGroup }) };
  try {
    const chosen = chooseTarget(record, { signedIn: ctx.account.id, explicit, computedGroup: ctx.computedGroup });
    knownTarget = { subscriptionId: chosen.subscriptionId, resourceGroup: chosen.group };
    return { ...chosen, anyState: record.anyState };
  } catch (e) {
    fail(e.message + ".");
  }
}
const inGroup = (group) => (account) => account.id?.toLowerCase().includes(`/resourcegroups/${group.toLowerCase()}/`);
const courseGroupName = (account) => /\/resourcegroups\/([^/]+)\//i.exec(account.id ?? "")?.[1] ?? "";

async function retail(filter, { allowOverride = false } = {}) {
  // Test hook, honoured only for the read-only `prices` command, only with live Azure disabled and only on loopback.
  // Plan and set-up always use the real Retail Prices API.
  const override = process.env.ICODE_AZURE_PRICES_API;
  const useOverride = allowOverride && override && process.env.ICODE_AZURE_LIVE === "0" && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(override);
  if (useOverride && !retail.announced) {
    retail.announced = true;
    console.log(`(prices overridden for a test: ${override})`);
  }
  const api = useOverride ? override : "https://prices.azure.com/api/retail/prices";
  const items = [];
  let url = `${api}?$filter=${encodeURIComponent(filter)}`;
  for (let page = 0; url && page < 10; page++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Retail Prices API returned ${response.status}`);
    const body = await response.json();
    items.push(...(body.Items ?? []));
    url = body.NextPageLink;
  }
  return items;
}
async function prices(region, options) {
  try {
    return searchBasicHourly(await retail(`serviceName eq 'Azure Cognitive Search' and armRegionName eq '${region}' and skuName eq 'Basic' and priceType eq 'Consumption'`, options));
  } catch {
    return null;
  }
}
async function tokenPrices(model, region, options) {
  // contains() is case-sensitive and meter names vary ("text-embedding-3-small-glbl", "GPT 5 Mini Inpt Glbl"), so try the common spellings.
  const words = model.name.split("-");
  const spellings = [model.name, words.join(" "), words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" "), [words[0].toUpperCase(), ...words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1))].join(" ")];
  const items = [];
  for (const name of new Set(spellings)) {
    try {
      items.push(...(await retail(`priceType eq 'Consumption' and contains(meterName, '${name}')`, options)));
    } catch {}
  }
  const meters = modelMeters(items, model.name, region);
  // GlobalStandard deployments bill on the "Glbl" meters; batch and data-zone meters do not apply here.
  return model.sku === "GlobalStandard" ? meters.filter((m) => /glbl/i.test(m.meter) && !/batch/i.test(m.meter)) : meters;
}

/** List prices only: no Azure sign-in needed, nothing is read from or created in a subscription. */
async function showPrices() {
  const region = config.region;
  const options = { allowOverride: true };
  console.log(`Azure Retail Prices API list prices for region ${region} (retrieved ${new Date().toISOString()}):\n`);
  const hourly = await prices(region, options);
  console.log(`Azure AI Search Basic, 1 search unit${hourly ? ` (meter "${hourly.meter}")` : ""}: ${hourly ? `${hourly.price} ${hourly.currency}/hour (≈ ${estimateCost(hourly.price, 24)} ${hourly.currency}/day, ≈ ${estimateCost(hourly.price, 730)} ${hourly.currency}/month)` : "not available (offline, or no Basic price for this region)"}`);
  for (const model of [config.chatModel, config.embeddingModel]) {
    const meters = await tokenPrices(model, region, options);
    console.log(`\n${model.name} (${model.sku}) per-token meters:`);
    if (!meters.length) console.log("  not found; see https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/");
    for (const m of meters) console.log(`  • ${m.meter} [${m.region || "global"}]: ${m.price} ${m.currency} per ${m.unit}`);
  }
  console.log("\nList prices exclude taxes and your agreement's discounts. Run `npm run azure:plan` after `az login` to check models in your subscription.");
}

async function plan() {
  const ctx = context();
  const t = target(ctx);
  console.log(`Subscription: ${ctx.account.name} (${ctx.account.id})\nSigned in as: ${ctx.owner}\nRegion:       ${ctx.region}\nResource group (course only): ${t.group}\n`);
  const models = az(["cognitiveservices", "model", "list", "--location", ctx.region]);
  const problems = [];
  for (const wanted of [config.chatModel, config.embeddingModel]) {
    const check = checkModel(models, wanted, new Date());
    console.log(`${check.ok ? "✔" : "✖"} Model ${wanted.name} ${wanted.version} (${wanted.sku})${check.ok ? (check.retires ? `, retires ${check.retires.slice(0, 10)}` : "") : `: ${check.reason}`}`);
    if (!check.ok) problems.push(check.reason);
  }
  const hourly = await prices(ctx.region); // always the real Retail Prices API
  console.log("\nWhat “Set up Azure” (`npm run azure:up`) creates and what it costs:");
  console.log(`  • Azure AI Search, Basic tier, 1 search unit — billed every hour it exists: ${hourly ? `${hourly.price} ${hourly.currency}/hour (≈ ${estimateCost(hourly.price, 24)} ${hourly.currency}/day)` : "price not available; check https://azure.microsoft.com/pricing/calculator/"}`);
  console.log("  • Semantic ranker on the free plan — monthly allowance; extra requests fail instead of being billed.");
  console.log("  • Azure OpenAI (S0) with an embedding and a chat deployment — pay per token, no hourly charge; the labs use a few hundred thousand tokens at most.");
  console.log("  • Role assignments for you (no keys are created).");
  console.log("\nPrices are list prices from the Azure Retail Prices API; your agreement, currency and taxes may differ.");
  console.log("Budget alerts only notify you; they do not stop spending. Shut down as soon as you finish: deleting the resource group stops all charges.");
  if (problems.length) console.log(`\n✖ Edit azure/config.json before setting up: choose a region and model versions offered to your subscription (see the lesson).`);
  return { ctx, t, problems, hourly };
}

async function up() {
  const { ctx, t, problems, hourly } = await plan();
  if (problems.length) fail(`Fix azure/config.json first (choose a model/version offered in ${ctx.region}).`);
  const group = t.group;
  if (az(["group", "exists", "--name", group])) console.log(`\nResource group ${group} already exists; it will be updated.`);
  const answer = await ask("create", `Create billable Azure resources in subscription ${ctx.account.name} (${ctx.region})? Azure AI Search Basic is charged every hour until you shut down.`);
  if (!confirmed(answer, "create")) cancel("Cancelled. Nothing was created.");
  const principal = az(["ad", "signed-in-user", "show", "--query", "id", "-o", "tsv"], { json: false, allowFail: true });
  if (!principal) fail("Could not read your Entra ID object ID (`az ad signed-in-user show`). Sign in as a user, not a service principal.");
  const tags = courseTags(config.courseTag, ctx.owner, new Date(), config.expiresAfterHours);
  // Record first: the cost banner shows even if this run is interrupted or fails part-way.
  recordMayExist({ reason: "set up started", resourceGroup: group, subscriptionId: ctx.account.id, startedAt: tags.createdAt });
  process.on("SIGINT", () => {
    console.error("\nInterrupted: some resources may exist and be billing. Run “Shut down Azure” (npm run azure:down), then “Verify cost is zero”.");
    process.exit(130);
  });
  az(["group", "create", "--name", group, "--location", ctx.region, "--tags", ...Object.entries(tags).map(([k, v]) => `${k}=${v}`)]);
  const parameters = join(root, ".azure/parameters.json");
  writeFileSync(parameters, JSON.stringify({ principalId: { value: principal }, tags: { value: tags }, chatModel: { value: config.chatModel }, embeddingModel: { value: config.embeddingModel } }));
  console.log("Deploying (several minutes)…");
  const deployment = az(["deployment", "group", "create", "--resource-group", group, "--name", "course", "--template-file", join(root, "azure/main.bicep"), "--parameters", `@${parameters}`]);
  const out = Object.fromEntries(Object.entries(deployment.properties.outputs).map(([k, v]) => [k, v.value]));
  writeFileSync(envFile, JSON.stringify({ ...out, resourceGroup: group, region: ctx.region, subscriptionId: ctx.account.id, indexName: config.indexName, dimensions: config.embeddingModel.dimensions, createdAt: tags.createdAt, hourly }, null, 2) + "\n");
  rmSync(join(root, COST_MARKERS.mayExist), { force: true }); // env.json now drives the banner; the outside record stays
  console.log(`\n✔ Created. Endpoints written to course/.azure/env.json.\n  Role assignments can take a few minutes to apply; if live tests return 403, wait and retry.\n  When you are done: “Shut down Azure” (npm run azure:down), then “Verify cost is zero” (npm run azure:verify).`);
}

function status() {
  recordUnknownOnFailure = true;
  const ctx = context();
  const t = target(ctx);
  // Status never clears a banner: only a full verify can.
  if (!az(["group", "exists", "--name", t.group])) {
    console.log(`No course resource group ${t.group} in this subscription.`);
    if (t.anyState) console.log("Run “Verify cost is zero” (npm run azure:verify) to check for anything else left and clear the cost banner.");
    return;
  }
  const group = az(["group", "show", "--name", t.group]);
  const resources = az(["resource", "list", "--resource-group", t.group]);
  if (!existsSync(envFile)) recordMayExist({ reason: "resource group exists", resourceGroup: t.group, subscriptionId: ctx.account.id, checkedAt: new Date().toISOString() });
  const hours = (Date.now() - Date.parse(group.tags?.createdAt ?? new Date().toISOString())) / 3600_000;
  const env = readMarker(COST_MARKERS.env) ?? {};
  console.log(`Resource group ${t.group} (created ${group.tags?.createdAt}, expires ${group.tags?.expiresAt}):`);
  for (const r of resources) console.log(`  • ${r.type}  ${r.name}`);
  console.log(`Running for ${hours.toFixed(1)} h${env.hourly ? `; search cost so far ≈ ${estimateCost(env.hourly.price, hours)} ${env.hourly.currency} plus tokens` : ""}.`);
  console.log("Stop all charges with “Shut down Azure” (npm run azure:down).");
}

function verify() {
  recordUnknownOnFailure = true;
  const ctx = context();
  const t = target(ctx, { explicit: explicitSubscription });
  // Sweep the whole subscription, not only the recorded group: every course-tagged group and resource, plus
  // soft-deleted accounts from any course resource group.
  const groupExists = az(["group", "exists", "--name", t.group]);
  const taggedGroups = az(["group", "list", "--tag", `course=${config.courseTag}`]).map((g) => g.name);
  const taggedResources = az(["resource", "list", "--tag", `course=${config.courseTag}`]);
  const deletedAccounts = az(["cognitiveservices", "account", "list-deleted"]).filter(
    (a) => inGroup(t.group)(a) || courseGroupName(a).toLowerCase().startsWith(`${config.resourceGroupPrefix.toLowerCase()}-`),
  );
  const remaining = remainingAfterTeardown({ groupExists, group: t.group, taggedGroups, taggedResources, deletedAccounts });
  if (remaining.length) {
    applyMarkers(markerChanges({ kind: "remaining", items: remaining, subscriptionId: t.subscriptionId, resourceGroup: t.group }));
    recordMayExist({ subscriptionId: t.subscriptionId, resourceGroup: t.group });
    console.error(
      `✖ Course resources remain in subscription ${ctx.account.name}:\n${remaining.map((r) => `  • ${r}`).join("\n")}\n` +
        `In a shared subscription, some may belong to another learner's course group.\n` +
        `Run “Shut down Azure” (npm run azure:down) again. If that fails, delete resource group ${t.group} (tag course=${config.courseTag}) in the Azure portal ` +
        `or with \`az group delete --name ${t.group}\`, and purge soft-deleted accounts with \`az cognitiveservices account purge\` (see lesson 21).`,
    );
    process.exit(1);
  }
  if (t.anyState || t.recorded) clearAllState();
  if (explicitSubscription !== undefined)
    console.log(
      `This sweep covered only subscription ${ctx.account.id}, the one you named. If you are not sure which subscription you used for Lab 03, ` +
        `run Verify in each of them: the banner was cleared on the evidence of this subscription alone.`,
    );
  console.log(`✔ Verified: no course resources remain in subscription ${ctx.account.name} (${ctx.account.id}). This course incurs no further charges there.`);
}

async function down() {
  recordUnknownOnFailure = true;
  const ctx = context();
  const t = target(ctx);
  // The recorded group; without a record, every course-tagged group you own in this subscription.
  let groups;
  if (t.groupRecorded) groups = az(["group", "exists", "--name", t.group]) ? [t.group] : [];
  else {
    groups = az(["group", "list", "--tag", `course=${config.courseTag}`])
      .filter((g) => (g.tags?.owner ?? "").toLowerCase() === ctx.owner.toLowerCase())
      .map((g) => g.name);
    if (!groups.length) console.log(`No recorded resource group, and no course-tagged group owned by ${ctx.owner} in this subscription.`);
  }
  for (const name of groups) {
    const group = az(["group", "show", "--name", name]);
    if (!isCourseGroup(group, config.courseTag)) fail(`${name} is not tagged course=${config.courseTag}; refusing to delete it.`);
    console.log(`This permanently deletes resource group ${name} and everything in it:`);
    for (const r of az(["resource", "list", "--resource-group", name])) console.log(`  • ${r.type}  ${r.name}`);
    const answer = await ask(name, `Permanently delete resource group ${name} and everything in it? Type the resource group name.`);
    if (!confirmed(answer, name)) cancel("Cancelled. Nothing was deleted; charges continue while the resources exist.");
    // Until verify proves otherwise, resources may exist (a deletion can be interrupted or fail).
    recordMayExist({ reason: "shutdown started", resourceGroup: name, subscriptionId: ctx.account.id, startedAt: new Date().toISOString() });
    process.on("SIGINT", () => {
      console.error("\nInterrupted: deletion may be incomplete. Run “Shut down Azure” again, then “Verify cost is zero”.");
      process.exit(130);
    });
    console.log("Deleting (several minutes)…");
    az(["group", "delete", "--name", name, "--yes"], { json: false });
  }
  if (t.groupRecorded && !groups.length) console.log(`${t.group} does not exist.`);
  const purgeFrom = new Set([t.group, ...groups].map((g) => g.toLowerCase()));
  for (const account of az(["cognitiveservices", "account", "list-deleted"]).filter((a) => purgeFrom.has(courseGroupName(a).toLowerCase()))) {
    console.log(`Purging soft-deleted ${account.name}…`);
    az(["cognitiveservices", "account", "purge", "--location", account.location, "--resource-group", courseGroupName(account), "--name", account.name], { json: false });
  }
  for (const path of [COST_MARKERS.env, ".azure/parameters.json"]) rmSync(join(root, path), { force: true });
  verify();
}

/** Sidecar: keeps the banner honest if course/.azure/ is deleted while the workshop runs. Never calls Azure. */
async function watch() {
  const check = () => {
    if (restoreLostState()) console.log(`${new Date().toISOString()} course/.azure was missing while Lab 03 resources may exist; restored a “Cost status unknown” banner.`);
  };
  console.log(`Watching Lab 03 cost state (record: ${durableFile}).`);
  check();
  const timer = setInterval(check, 5_000);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"])
    process.on(signal, () => {
      clearInterval(timer);
      process.exit(0);
    });
  await new Promise(() => {});
}

const commands = { prices: showPrices, plan, up, status, down, verify, watch };
if (!commands[command]) fail("Usage: node icode/azure.mjs prices|plan|up|status|down|verify [--subscription <id>]|watch");
if (command !== "watch" && restoreLostState()) console.error("! course/.azure was missing while Lab 03 resources may exist; the banner now shows “Cost status unknown” until Verify passes.");
await commands[command]();
if (command !== "watch") {
  lines?.close();
  process.stdin.destroy(); // the engine keeps stdin open; let the process exit
}
