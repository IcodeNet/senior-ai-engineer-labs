#!/usr/bin/env node
// Lab 03 Azure lifecycle: prices | plan | up | status | down | verify. Uses the Azure CLI (`az login` first).
// Runs from the Icode Workshop Actions tab (typed confirmations through the engine's per-run token) or a terminal.
// Nothing is created or deleted without a typed confirmation; shutdown deletes only the course-tagged resource group.
// Marker files in .azure/ drive the Icode cost banners (see course.json `indicators`) and fail closed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  COST_MARKERS,
  checkModel,
  confirmChannel,
  confirmLine,
  confirmed,
  courseTags,
  estimateCost,
  isCourseGroup,
  markerChanges,
  modelMeters,
  recordedSubscription,
  remainingAfterTeardown,
  resourceGroupName,
  searchBasicHourly,
} from "./azure-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "azure/config.json"), "utf8"));
const envFile = join(root, COST_MARKERS.env);
const command = process.argv[2];
// The confirmation token belongs to this process only: keep it out of the environment `az` inherits.
const channel = confirmChannel({ action: process.env.ICODE_ACTION, token: process.env.ICODE_CONFIRM_TOKEN, isTTY: Boolean(process.stdin.isTTY) });
const token = process.env.ICODE_CONFIRM_TOKEN;
delete process.env.ICODE_CONFIRM_TOKEN;
// Commands that check Azure state record "cost status unknown" when the check fails.
let recordUnknownOnFailure = false;

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
    applyMarkers(markerChanges({ kind: "unknown", reason: message.split("\n")[0] }));
    message += "\nThe Icode banner now shows “Cost status unknown” until a check succeeds.";
  }
  console.error(`\n✖ ${message}`);
  process.exit(1);
}
function cancel(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function readMarker(path) {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"));
  } catch {
    return undefined;
  }
}
function writeMarker(path, value) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), JSON.stringify(value, null, 2) + "\n");
}
function applyMarkers({ write, remove }) {
  for (const path of remove) rmSync(join(root, path), { force: true });
  for (const [path, value] of Object.entries(write)) writeMarker(path, value);
}

/** One typed confirmation: from the Icode dialog (token), a terminal prompt, or refused. */
async function ask(expected, message) {
  if (channel === "none")
    cancel("✖ A typed confirmation is required and cannot be piped. Run this from the Icode Workshop Actions tab or an interactive terminal. Nothing was changed.");
  if (channel === "icode") console.log(confirmLine(token, expected, message));
  else process.stdout.write(`\n${message}\nType ${expected} to continue (anything else cancels): `);
  const rl = createInterface({ input: process.stdin });
  const answer = await new Promise((done) => {
    rl.once("line", done);
    rl.once("close", () => done(""));
  });
  rl.close();
  process.stdin.destroy(); // the engine keeps stdin open; let the process exit
  return answer;
}

function context() {
  const account = az(["account", "show"], { allowFail: true });
  if (!account) fail("Not signed in to Azure. Run `az login` (and `az account set --subscription <id>` if you have several), then try again.");
  const owner = account.user?.name ?? "unknown";
  return { account, owner, group: resourceGroupName(config.resourceGroupPrefix, account.id, owner), region: config.region };
}

/** The current subscription must be the one recorded by `up`, or a check proves nothing about the cost. */
function requireRecordedSubscription(ctx) {
  const recorded = recordedSubscription([readMarker(COST_MARKERS.env), readMarker(COST_MARKERS.mayExist)]);
  if (recorded && recorded.toLowerCase() !== ctx.account.id.toLowerCase())
    fail(`Course resources were created in subscription ${recorded}, but you are signed in to ${ctx.account.id}. Run \`az account set --subscription ${recorded}\` and check again.`);
}

async function retail(filter) {
  const items = [];
  // ICODE_AZURE_PRICES_API lets offline tests point at an unreachable address; learners never need it.
  const api = process.env.ICODE_AZURE_PRICES_API || "https://prices.azure.com/api/retail/prices";
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
async function prices(region) {
  try {
    return searchBasicHourly(await retail(`serviceName eq 'Azure Cognitive Search' and armRegionName eq '${region}' and skuName eq 'Basic' and priceType eq 'Consumption'`));
  } catch {
    return null;
  }
}
async function tokenPrices(model, region) {
  // contains() is case-sensitive and meter names vary ("text-embedding-3-small-glbl", "GPT 5 Mini Inpt Glbl"), so try the common spellings.
  const words = model.name.split("-");
  const spellings = [model.name, words.join(" "), words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" "), [words[0].toUpperCase(), ...words.slice(1).map((w) => w[0].toUpperCase() + w.slice(1))].join(" ")];
  const items = [];
  for (const name of new Set(spellings)) {
    try {
      items.push(...(await retail(`priceType eq 'Consumption' and contains(meterName, '${name}')`)));
    } catch {}
  }
  const meters = modelMeters(items, model.name, region);
  // GlobalStandard deployments bill on the "Glbl" meters; batch and data-zone meters do not apply here.
  return model.sku === "GlobalStandard" ? meters.filter((m) => /glbl/i.test(m.meter) && !/batch/i.test(m.meter)) : meters;
}

/** List prices only: no Azure sign-in needed, nothing is read from or created in a subscription. */
async function showPrices() {
  const region = config.region;
  console.log(`Azure Retail Prices API list prices for region ${region} (retrieved ${new Date().toISOString()}):\n`);
  const hourly = await prices(region);
  console.log(`Azure AI Search Basic, 1 search unit: ${hourly ? `${hourly.price} ${hourly.currency}/hour (≈ ${estimateCost(hourly.price, 24)} ${hourly.currency}/day, ≈ ${estimateCost(hourly.price, 730)} ${hourly.currency}/month)` : "not available (offline, or no Basic price for this region)"}`);
  for (const model of [config.chatModel, config.embeddingModel]) {
    const meters = await tokenPrices(model, region);
    console.log(`\n${model.name} (${model.sku}) per-token meters:`);
    if (!meters.length) console.log("  not found; see https://azure.microsoft.com/pricing/details/cognitive-services/openai-service/");
    for (const m of meters) console.log(`  • ${m.meter} [${m.region || "global"}]: ${m.price} ${m.currency} per ${m.unit}`);
  }
  console.log("\nList prices exclude taxes and your agreement's discounts. Run `npm run azure:plan` after `az login` to check models in your subscription.");
}

async function plan() {
  const ctx = context();
  console.log(`Subscription: ${ctx.account.name} (${ctx.account.id})\nSigned in as: ${ctx.owner}\nRegion:       ${ctx.region}\nResource group (course only): ${ctx.group}\n`);
  const models = az(["cognitiveservices", "model", "list", "--location", ctx.region]);
  const problems = [];
  for (const wanted of [config.chatModel, config.embeddingModel]) {
    const check = checkModel(models, wanted, new Date());
    console.log(`${check.ok ? "✔" : "✖"} Model ${wanted.name} ${wanted.version} (${wanted.sku})${check.ok ? (check.retires ? `, retires ${check.retires.slice(0, 10)}` : "") : `: ${check.reason}`}`);
    if (!check.ok) problems.push(check.reason);
  }
  const hourly = await prices(ctx.region);
  console.log("\nWhat “Set up Azure” (`npm run azure:up`) creates and what it costs:");
  console.log(`  • Azure AI Search, Basic tier, 1 search unit — billed every hour it exists: ${hourly ? `${hourly.price} ${hourly.currency}/hour (≈ ${estimateCost(hourly.price, 24)} ${hourly.currency}/day)` : "price not available; check https://azure.microsoft.com/pricing/calculator/"}`);
  console.log("  • Semantic ranker on the free plan — monthly allowance; extra requests fail instead of being billed.");
  console.log("  • Azure OpenAI (S0) with an embedding and a chat deployment — pay per token, no hourly charge; the labs use a few hundred thousand tokens at most.");
  console.log("  • Role assignments for you (no keys are created).");
  console.log("\nPrices are list prices from the Azure Retail Prices API; your agreement, currency and taxes may differ.");
  console.log("Budget alerts only notify you; they do not stop spending. Shut down as soon as you finish: deleting the resource group stops all charges.");
  if (problems.length) console.log(`\n✖ Edit azure/config.json before setting up: choose a region and model versions offered to your subscription (see the lesson).`);
  return { ctx, problems, hourly };
}

async function up() {
  const { ctx, problems, hourly } = await plan();
  if (problems.length) fail(`Fix azure/config.json first (choose a model/version offered in ${ctx.region}).`);
  if (az(["group", "exists", "--name", ctx.group])) console.log(`\nResource group ${ctx.group} already exists; it will be updated.`);
  const answer = await ask("create", `Create billable Azure resources in subscription ${ctx.account.name} (${ctx.region})? Azure AI Search Basic is charged every hour until you shut down.`);
  if (!confirmed(answer, "create")) cancel("Cancelled. Nothing was created.");
  const principal = az(["ad", "signed-in-user", "show", "--query", "id", "-o", "tsv"], { json: false, allowFail: true });
  if (!principal) fail("Could not read your Entra ID object ID (`az ad signed-in-user show`). Sign in as a user, not a service principal.");
  const tags = courseTags(config.courseTag, ctx.owner, new Date(), config.expiresAfterHours);
  // Marker first: the cost banner shows even if this run is interrupted or fails part-way.
  writeMarker(COST_MARKERS.mayExist, { reason: "set up started", resourceGroup: ctx.group, subscriptionId: ctx.account.id, startedAt: tags.createdAt });
  process.on("SIGINT", () => {
    console.error("\nInterrupted: some resources may exist and be billing. Run “Shut down Azure” (npm run azure:down), then “Verify cost is zero”.");
    process.exit(130);
  });
  az(["group", "create", "--name", ctx.group, "--location", ctx.region, "--tags", ...Object.entries(tags).map(([k, v]) => `${k}=${v}`)]);
  const parameters = join(root, ".azure/parameters.json");
  writeFileSync(parameters, JSON.stringify({ principalId: { value: principal }, tags: { value: tags }, chatModel: { value: config.chatModel }, embeddingModel: { value: config.embeddingModel } }));
  console.log("Deploying (several minutes)…");
  const deployment = az(["deployment", "group", "create", "--resource-group", ctx.group, "--name", "course", "--template-file", join(root, "azure/main.bicep"), "--parameters", `@${parameters}`]);
  const out = Object.fromEntries(Object.entries(deployment.properties.outputs).map(([k, v]) => [k, v.value]));
  writeFileSync(envFile, JSON.stringify({ ...out, resourceGroup: ctx.group, region: ctx.region, subscriptionId: ctx.account.id, indexName: config.indexName, dimensions: config.embeddingModel.dimensions, createdAt: tags.createdAt, hourly }, null, 2) + "\n");
  rmSync(join(root, COST_MARKERS.mayExist), { force: true }); // env.json now drives the banner
  console.log(`\n✔ Created. Endpoints written to course/.azure/env.json.\n  Role assignments can take a few minutes to apply; if live tests return 403, wait and retry.\n  When you are done: “Shut down Azure” (npm run azure:down), then “Verify cost is zero” (npm run azure:verify).`);
}

function status() {
  recordUnknownOnFailure = true;
  const ctx = context();
  requireRecordedSubscription(ctx);
  rmSync(join(root, COST_MARKERS.unknown), { force: true });
  if (!az(["group", "exists", "--name", ctx.group])) {
    console.log(`No course resource group in this subscription (${ctx.group} does not exist).`);
    if (existsSync(join(root, COST_MARKERS.env)) || existsSync(join(root, COST_MARKERS.mayExist)))
      console.log("Run “Verify cost is zero” (npm run azure:verify) to check for anything else left and clear the cost banner.");
    return;
  }
  const group = az(["group", "show", "--name", ctx.group]);
  const resources = az(["resource", "list", "--resource-group", ctx.group]);
  if (!existsSync(envFile)) writeMarker(COST_MARKERS.mayExist, { reason: "resource group exists", resourceGroup: ctx.group, subscriptionId: ctx.account.id, checkedAt: new Date().toISOString() });
  const hours = (Date.now() - Date.parse(group.tags?.createdAt ?? new Date().toISOString())) / 3600_000;
  const env = readMarker(COST_MARKERS.env) ?? {};
  console.log(`Resource group ${ctx.group} (created ${group.tags?.createdAt}, expires ${group.tags?.expiresAt}):`);
  for (const r of resources) console.log(`  • ${r.type}  ${r.name}`);
  console.log(`Running for ${hours.toFixed(1)} h${env.hourly ? `; search cost so far ≈ ${estimateCost(env.hourly.price, hours)} ${env.hourly.currency} plus tokens` : ""}.`);
  console.log("Stop all charges with “Shut down Azure” (npm run azure:down).");
}

function verify() {
  recordUnknownOnFailure = true;
  const ctx = context();
  requireRecordedSubscription(ctx);
  const groupExists = az(["group", "exists", "--name", ctx.group]);
  const taggedResources = az(["resource", "list", "--tag", `course=${config.courseTag}`]);
  const deleted = az(["cognitiveservices", "account", "list-deleted"]);
  const deletedAccounts = (deleted ?? []).filter((a) => a.id?.toLowerCase().includes(`/resourcegroups/${ctx.group.toLowerCase()}/`));
  const remaining = remainingAfterTeardown({ groupExists, taggedResources, deletedAccounts });
  if (remaining.length) {
    applyMarkers(markerChanges({ kind: "remaining", items: remaining }));
    writeMarker(COST_MARKERS.mayExist, { ...readMarker(COST_MARKERS.mayExist), resourceGroup: ctx.group, subscriptionId: ctx.account.id });
    console.error(
      `✖ Course resources remain:\n${remaining.map((r) => `  • ${r}`).join("\n")}\n` +
        `Run “Shut down Azure” (npm run azure:down) again. If that fails, delete resource group ${ctx.group} (tag course=${config.courseTag}) in the Azure portal ` +
        `or with \`az group delete --name ${ctx.group}\`, and purge soft-deleted accounts with \`az cognitiveservices account purge\` (see lesson 21).`,
    );
    process.exit(1);
  }
  applyMarkers(markerChanges({ kind: "zero" }));
  rmSync(join(root, ".azure"), { recursive: true, force: true });
  console.log(`✔ Verified: no course resources remain in subscription ${ctx.account.name}. This course incurs no further charges.`);
}

async function down() {
  recordUnknownOnFailure = true;
  const ctx = context();
  requireRecordedSubscription(ctx);
  if (az(["group", "exists", "--name", ctx.group])) {
    const group = az(["group", "show", "--name", ctx.group]);
    if (!isCourseGroup(group, config.courseTag)) fail(`${ctx.group} is not tagged course=${config.courseTag}; refusing to delete it.`);
    console.log(`This permanently deletes resource group ${ctx.group} and everything in it:`);
    for (const r of az(["resource", "list", "--resource-group", ctx.group])) console.log(`  • ${r.type}  ${r.name}`);
    const answer = await ask(ctx.group, `Permanently delete resource group ${ctx.group} and everything in it? Type the resource group name.`);
    if (!confirmed(answer, ctx.group)) cancel("Cancelled. Nothing was deleted; charges continue while the resources exist.");
    // Until verify proves otherwise, resources may exist (a deletion can be interrupted or fail).
    writeMarker(COST_MARKERS.mayExist, { reason: "shutdown started", resourceGroup: ctx.group, subscriptionId: ctx.account.id, startedAt: new Date().toISOString() });
    process.on("SIGINT", () => {
      console.error("\nInterrupted: deletion may be incomplete. Run “Shut down Azure” again, then “Verify cost is zero”.");
      process.exit(130);
    });
    console.log("Deleting (several minutes)…");
    az(["group", "delete", "--name", ctx.group, "--yes"], { json: false });
  } else console.log(`${ctx.group} does not exist.`);
  for (const account of (az(["cognitiveservices", "account", "list-deleted"]) ?? []).filter((a) => a.id?.toLowerCase().includes(`/resourcegroups/${ctx.group.toLowerCase()}/`))) {
    console.log(`Purging soft-deleted ${account.name}…`);
    az(["cognitiveservices", "account", "purge", "--location", account.location, "--resource-group", ctx.group, "--name", account.name], { json: false });
  }
  for (const path of [COST_MARKERS.env, ".azure/parameters.json"]) rmSync(join(root, path), { force: true });
  verify();
}

const commands = { prices: showPrices, plan, up, status, down, verify };
if (!commands[command]) fail("Usage: node icode/azure.mjs prices|plan|up|status|down|verify");
await commands[command]();
