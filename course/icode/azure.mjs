#!/usr/bin/env node
// Lab 03 Azure lifecycle: plan | up | status | down | verify. Uses the Azure CLI (`az login` first).
// Nothing is created without a typed confirmation; shutdown deletes only the course-tagged resource group.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { checkModel, confirmed, courseTags, estimateCost, isCourseGroup, remainingAfterTeardown, resourceGroupName, searchBasicHourly } from "./azure-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "azure/config.json"), "utf8"));
const envFile = join(root, ".azure/env.json");
const command = process.argv[2];

function az(args, { json = true, allowFail = false } = {}) {
  const result = spawnSync("az", json ? [...args, "-o", "json"] : args, { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
  if (result.error?.code === "ENOENT") fail("Azure CLI not found. Install it from https://aka.ms/azure-cli, then run `az login`.");
  if (result.status !== 0) {
    if (allowFail) return undefined;
    fail(`az ${args.join(" ")} failed:\n${(result.stderr || result.stdout).trim()}`);
  }
  return json ? JSON.parse(result.stdout || "null") : result.stdout.trim();
}
function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}
async function ask(question) {
  if (process.env.ICODE_AZURE_CONFIRM !== undefined) return process.env.ICODE_AZURE_CONFIRM;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

function context() {
  const account = az(["account", "show"], { allowFail: true });
  if (!account) fail("Not signed in. Run `az login` (and `az account set --subscription <id>` if you have several).");
  const owner = account.user?.name ?? "unknown";
  return { account, owner, group: resourceGroupName(config.resourceGroupPrefix, account.id, owner), region: config.region };
}

async function prices(region) {
  const filter = `serviceName eq 'Azure Cognitive Search' and armRegionName eq '${region}' and skuName eq 'Basic' and priceType eq 'Consumption'`;
  try {
    const response = await fetch(`https://prices.azure.com/api/retail/prices?$filter=${encodeURIComponent(filter)}`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    return searchBasicHourly((await response.json()).Items ?? []);
  } catch {
    return null;
  }
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
  console.log("\nWhat `npm run azure:up` creates and what it costs:");
  console.log(`  • Azure AI Search, Basic tier, 1 search unit — billed every hour it exists: ${hourly ? `${hourly.price} ${hourly.currency}/hour (≈ ${estimateCost(hourly.price, 24)} ${hourly.currency}/day)` : "price not available; check https://azure.microsoft.com/pricing/calculator/"}`);
  console.log("  • Semantic ranker on the free plan — monthly allowance; extra requests fail instead of being billed.");
  console.log("  • Azure OpenAI (S0) with an embedding and a chat deployment — pay per token, no hourly charge; the labs use a few hundred thousand tokens at most.");
  console.log("  • Role assignments for you (no keys are created).");
  console.log("\nPrices are list prices from the Azure Retail Prices API; your agreement, currency and taxes may differ.");
  console.log("Run `npm run azure:down` as soon as you finish: deleting the resource group stops all charges.");
  return { ctx, problems, hourly };
}

async function up() {
  const { ctx, problems, hourly } = await plan();
  if (problems.length) fail(`Fix azure/config.json first (choose a model/version offered in ${ctx.region}).`);
  if (az(["group", "exists", "--name", ctx.group])) console.log(`\nResource group ${ctx.group} already exists; it will be updated.`);
  const answer = await ask('\nType "create" to create these billable resources, anything else to cancel: ');
  if (!confirmed(answer, "create")) fail("Cancelled. Nothing was created.");
  const principal = az(["ad", "signed-in-user", "show", "--query", "id", "-o", "tsv"], { json: false, allowFail: true });
  if (!principal) fail("Could not read your Entra ID object ID (`az ad signed-in-user show`). Sign in as a user, not a service principal.");
  const tags = courseTags(config.courseTag, ctx.owner, new Date(), config.expiresAfterHours);
  az(["group", "create", "--name", ctx.group, "--location", ctx.region, "--tags", ...Object.entries(tags).map(([k, v]) => `${k}=${v}`)]);
  const parameters = join(root, ".azure/parameters.json");
  mkdirSync(dirname(parameters), { recursive: true });
  writeFileSync(parameters, JSON.stringify({ principalId: { value: principal }, tags: { value: tags }, chatModel: { value: config.chatModel }, embeddingModel: { value: config.embeddingModel } }));
  console.log("Deploying (several minutes)…");
  const deployment = az(["deployment", "group", "create", "--resource-group", ctx.group, "--name", "course", "--template-file", join(root, "azure/main.bicep"), "--parameters", `@${parameters}`]);
  const out = Object.fromEntries(Object.entries(deployment.properties.outputs).map(([k, v]) => [k, v.value]));
  writeFileSync(envFile, JSON.stringify({ ...out, resourceGroup: ctx.group, region: ctx.region, subscriptionId: ctx.account.id, indexName: config.indexName, dimensions: config.embeddingModel.dimensions, createdAt: tags.createdAt, hourly }, null, 2) + "\n");
  console.log(`\n✔ Created. Endpoints written to course/.azure/env.json.\n  Role assignments can take a few minutes to apply; if live tests return 403, wait and retry.\n  When you are done: npm run azure:down`);
}

function status() {
  const ctx = context();
  if (!az(["group", "exists", "--name", ctx.group])) return console.log(`No course resources in this subscription (${ctx.group} does not exist). Cost: nothing further.`);
  const group = az(["group", "show", "--name", ctx.group]);
  const resources = az(["resource", "list", "--resource-group", ctx.group]);
  const hours = (Date.now() - Date.parse(group.tags?.createdAt ?? new Date().toISOString())) / 3600_000;
  const env = existsSync(envFile) ? JSON.parse(readFileSync(envFile, "utf8")) : {};
  console.log(`Resource group ${ctx.group} (created ${group.tags?.createdAt}, expires ${group.tags?.expiresAt}):`);
  for (const r of resources) console.log(`  • ${r.type}  ${r.name}`);
  console.log(`Running for ${hours.toFixed(1)} h${env.hourly ? `; search cost so far ≈ ${estimateCost(env.hourly.price, hours)} ${env.hourly.currency} plus tokens` : ""}.`);
  console.log("Stop all charges with: npm run azure:down");
}

function verify() {
  const ctx = context();
  const groupExists = az(["group", "exists", "--name", ctx.group]);
  const taggedResources = az(["resource", "list", "--tag", `course=${config.courseTag}`]);
  const deletedAccounts = (az(["cognitiveservices", "account", "list-deleted"], { allowFail: true }) ?? []).filter((a) => a.id?.toLowerCase().includes(`/resourcegroups/${ctx.group.toLowerCase()}/`));
  const remaining = remainingAfterTeardown({ groupExists, taggedResources, deletedAccounts });
  if (remaining.length) {
    console.error(`✖ Course resources remain:\n${remaining.map((r) => `  • ${r}`).join("\n")}\nRun npm run azure:down (again), or remove them in the Azure portal.`);
    process.exit(1);
  }
  console.log(`✔ Verified: no course resources remain in subscription ${ctx.account.name}. This course incurs no further charges.`);
}

async function down() {
  const ctx = context();
  if (az(["group", "exists", "--name", ctx.group])) {
    const group = az(["group", "show", "--name", ctx.group]);
    if (!isCourseGroup(group, config.courseTag)) fail(`${ctx.group} is not tagged course=${config.courseTag}; refusing to delete it.`);
    console.log(`This permanently deletes resource group ${ctx.group} and everything in it:`);
    for (const r of az(["resource", "list", "--resource-group", ctx.group])) console.log(`  • ${r.type}  ${r.name}`);
    const answer = await ask(`\nType the resource group name (${ctx.group}) to delete it: `);
    if (!confirmed(answer, ctx.group)) fail("Cancelled. Nothing was deleted; charges continue while the resources exist.");
    console.log("Deleting (several minutes)…");
    az(["group", "delete", "--name", ctx.group, "--yes"], { json: false });
  } else console.log(`${ctx.group} does not exist.`);
  for (const account of (az(["cognitiveservices", "account", "list-deleted"], { allowFail: true }) ?? []).filter((a) => a.id?.toLowerCase().includes(`/resourcegroups/${ctx.group.toLowerCase()}/`))) {
    console.log(`Purging soft-deleted ${account.name}…`);
    az(["cognitiveservices", "account", "purge", "--location", account.location, "--resource-group", ctx.group, "--name", account.name], { json: false });
  }
  rmSync(join(root, ".azure"), { recursive: true, force: true });
  verify();
}

const commands = { plan, up, status, down, verify };
if (!commands[command]) fail("Usage: node icode/azure.mjs plan|up|status|down|verify");
await commands[command]();
