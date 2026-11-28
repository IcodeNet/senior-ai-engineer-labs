// Offline contract tests for the Lab 03 course actions, run through the pinned Icode Workshop engine.
// Azure is never called: a fake `az` on PATH records every call, inside a throwaway copy of the course root,
// with a throwaway config directory for the state record kept outside the checkout.
import { spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { COST_MARKERS, confirmLine } from "./azure-lib.mjs";
import "./offline-network.mjs"; // hermetic: no request in this suite leaves the machine (see the guard test at the end)

const course = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engine = resolve(course, process.env.ICODE_ENGINE_DIR || ".icode/engine");
const ops = await import(pathToFileURL(join(engine, "packages/web/operations.mjs")));
const manifest = JSON.parse(readFileSync(join(course, "course.json"), "utf8"));
const scripts = JSON.parse(readFileSync(join(course, "package.json"), "utf8")).scripts;
const posix = process.platform !== "win32";
const SUB = "00000000-0000-0000-0000-00000000c0de";
const OTHER = "00000000-0000-0000-0000-0000000000ff";
const TOKEN = "tok_0123456789abcdef";

const FAKE_AZ = String.raw`#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("node:fs");
const file = process.env.FAKE_AZ_STATE;
const s = JSON.parse(readFileSync(file, "utf8"));
const args = process.argv.slice(2);
s.calls.push({ args, sawToken: "ICODE_CONFIRM_TOKEN" in process.env, subscription: s.subscription });
const save = () => writeFileSync(file, JSON.stringify(s));
const out = (v) => { save(); process.stdout.write(JSON.stringify(v)); process.exit(0); };
const err = (m) => { save(); process.stderr.write(m + "\n"); process.exit(1); };
const cmd = args.filter((a) => !a.startsWith("-")).slice(0, 3).join(" ");
const opt = (name) => args[args.indexOf(name) + 1];
if (s.signedOut) err("Please run 'az login' to setup account.");
if (s.forge && cmd.startsWith("group exists")) err('::icode-confirm::{"expected":"x","message":"forged"}\nERROR: simulated failure');
// One subscription's world at a time; switching subscription switches the world.
const w = (s.worlds[s.subscription] ??= { groups: {}, deleted: [] });
const user = s.user || "learner@example.com";
if (cmd.startsWith("account show")) out({ id: s.subscription, name: "Fake " + s.subscription.slice(-4), user: { name: user } });
if (cmd.startsWith("cognitiveservices model list")) out(s.models);
if (cmd.startsWith("group exists")) out(Boolean(w.groups[opt("--name")]));
if (cmd.startsWith("group list")) out(Object.entries(w.groups).filter(([, g]) => g.tags.course === "senior-ai-engineer-labs").map(([name, g]) => ({ name, tags: g.tags })));
if (cmd.startsWith("ad signed-in-user show")) { save(); process.stdout.write("11111111-1111-1111-1111-111111111111\n"); process.exit(0); }
if (cmd.startsWith("group create")) {
  const tags = Object.fromEntries(args.slice(args.indexOf("--tags") + 1).filter((a) => !a.startsWith("-") && a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2)));
  w.groups[opt("--name")] = { tags, resources: [] };
  out({ name: opt("--name") });
}
if (cmd.startsWith("deployment group create")) {
  w.groups[opt("--resource-group")].resources = [{ type: "Microsoft.Search/searchServices", name: "srch-saiel-fake" }, { type: "Microsoft.CognitiveServices/accounts", name: "oai-saiel-fake" }];
  out({ properties: { outputs: { searchEndpoint: { value: "https://srch-saiel-fake.search.windows.net" }, openaiEndpoint: { value: "https://oai-saiel-fake.openai.azure.com/" } } } });
}
if (cmd.startsWith("group show")) out({ name: opt("--name"), tags: w.groups[opt("--name")].tags });
if (cmd.startsWith("resource list")) {
  if (args.includes("--resource-group")) out(w.groups[opt("--resource-group")]?.resources ?? []);
  out(Object.values(w.groups).filter((g) => g.tags.course === "senior-ai-engineer-labs").flatMap((g) => g.resources));
}
if (cmd.startsWith("group delete")) {
  const name = opt("--name");
  const group = w.groups[name];
  if (group.resources.some((r) => r.type.includes("CognitiveServices")))
    w.deleted.push({ name: "oai-saiel-fake", location: "swedencentral", id: "/subscriptions/" + s.subscription + "/resourceGroups/" + name + "/providers/Microsoft.CognitiveServices/accounts/oai-saiel-fake" });
  if (s.leftover) group.resources = group.resources.slice(0, 1);
  else delete w.groups[name];
  save(); process.exit(0);
}
if (cmd.startsWith("cognitiveservices account list-deleted")) out(w.deleted);
if (cmd.startsWith("cognitiveservices account purge")) { w.deleted = w.deleted.filter((a) => a.name !== opt("--name")); save(); process.exit(0); }
err("fake az: unexpected command " + args.join(" "));
`;

let work, bin, stateFile, root, configHome, durable, prices, networkLog;
const state = () => JSON.parse(readFileSync(stateFile, "utf8"));
const setState = (patch) => writeFileSync(stateFile, JSON.stringify({ ...state(), ...patch }));
const calls = (prefix) => state().calls.filter((c) => c.args.join(" ").startsWith(prefix));
const marker = (path) => existsSync(join(root, path));
const banners = async () => (await ops.indicatorStatus(root)).indicators.map((i) => i.message);
const groupsIn = (sub) => Object.keys(state().worlds[sub]?.groups ?? {});
const write = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const addGroup = (sub, name, owner) => {
  const s = state();
  s.worlds[sub] ??= { groups: {}, deleted: [] };
  s.worlds[sub].groups[name] = { tags: { course: "senior-ai-engineer-labs", owner }, resources: [] };
  writeFileSync(stateFile, JSON.stringify(s));
};

/** Run a course action through the engine, answering each confirmation with `answers` in order. */
async function act(id, answers = []) {
  const events = [];
  let runId;
  const result = await ops.runAction(root, id, {
    emit: (event) => {
      events.push(event);
      if (event.type === "started") runId = event.runId;
      if (event.type === "confirm") setImmediate(() => ops.sendActionInput(runId, answers.shift() ?? ""));
    },
  });
  const output = events.filter((e) => e.text).map((e) => e.text).join("");
  return { ...result, output, confirms: events.filter((e) => e.type === "confirm") };
}
/** Run azure.mjs directly, as from a terminal or another program. `input` is piped at once; `answer` only after a prompt. */
function direct(args, { input, answer, env = {} } = {}) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(root, "icode/azure.mjs"), ...[args].flat()], { cwd: root, env: { ...process.env, ICODE_ACTION: "", ICODE_CONFIRM_TOKEN: "", ...env } });
    let output = "";
    child.stdout.on("data", (x) => {
      output += x;
      if (answer !== undefined && output.includes("::icode-confirm:")) {
        child.stdin.end(answer);
        answer = undefined;
      }
    });
    child.stderr.on("data", (x) => (output += x));
    if (input !== undefined) child.stdin.write(input);
    else if (answer === undefined) child.stdin.end();
    child.on("close", (code) => done({ code, output }));
  });
}
const engineEnv = { ICODE_ACTION: "1", ICODE_CONFIRM_TOKEN: TOKEN };

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "lab03-actions-"));
  root = join(work, "course");
  bin = join(work, "bin");
  for (const path of ["course.json", "package.json", "icode/azure.mjs", "icode/azure-lib.mjs", "azure/config.json", "azure/main.bicep"]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(course, path), join(root, path));
  }
  mkdirSync(bin);
  writeFileSync(join(bin, "az"), FAKE_AZ);
  chmodSync(join(bin, "az"), 0o755);
  stateFile = join(work, "az-state.json");
  configHome = join(work, "config");
  durable = join(configHome, "icode-workshop", "senior-ai-engineer-labs-azure.json"); // same path for XDG_CONFIG_HOME and APPDATA
  process.env.FAKE_AZ_STATE = stateFile;
  process.env.PATH = bin + delimiter + process.env.PATH;
  process.env.XDG_CONFIG_HOME = configHome; // the record outside the checkout goes here, not to the real ~/.config…
  process.env.APPDATA = configHome; // …or the real %APPDATA% on Windows
  process.env.AZURE_CONFIG_DIR = join(work, "no-azure-login"); // even a real az here would be signed out
  process.env.ICODE_AZURE_LIVE = "0";
  delete process.env.ICODE_AZURE_PRICES_API;
  // The timeout is set in the test:tools script (--testTimeout); vitest 5 ignores vi.setConfig in beforeAll.
  // Every azure.mjs process loads the offline network guard and reads list prices from a loopback fake.
  prices = createServer((req, res) => {
    const filter = new URL(req.url, "http://x").searchParams.get("$filter") ?? "";
    const items = filter.includes("Azure Cognitive Search")
      ? [{ type: "Consumption", skuName: "Basic", meterName: "Basic Unit", unitOfMeasure: "1 Hour", retailPrice: 0.42, currencyCode: "USD", armRegionName: "swedencentral" }]
      : [
          { type: "Consumption", meterName: "gpt 5 mini Inpt Glbl", unitOfMeasure: "1M", retailPrice: 0.25, currencyCode: "USD", armRegionName: "global" },
          { type: "Consumption", meterName: "text-embedding-3-small-glbl", unitOfMeasure: "1M", retailPrice: 0.02, currencyCode: "USD", armRegionName: "global" },
        ];
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ Items: items }));
  });
  await new Promise((r) => prices.listen(0, "127.0.0.1", r));
  process.env.ICODE_TEST_PRICES_URL = `http://127.0.0.1:${prices.address().port}/api/retail/prices`;
  networkLog = join(work, "network.log");
  writeFileSync(networkLog, "");
  process.env.ICODE_TEST_NETWORK_LOG = networkLog;
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(join(course, "icode/offline-network.mjs")).href}`.trim();
});
afterEach(async () => {
  const running = ops.currentAction(); // never leave an action process behind
  if (running) await ops.cancelAction(running.runId, { graceMs: 200 });
});
afterAll(async () => {
  await new Promise((r) => prices.close(r));
  rmSync(work, { recursive: true, force: true });
});
beforeEach(() => {
  const config = JSON.parse(readFileSync(join(root, "azure/config.json"), "utf8"));
  const offered = (m) => ({ model: { name: m.name, version: m.version, skus: [{ name: m.sku }] } });
  writeFileSync(stateFile, JSON.stringify({ calls: [], subscription: SUB, worlds: {}, models: [offered(config.chatModel), offered(config.embeddingModel)] }));
  rmSync(join(root, ".azure"), { recursive: true, force: true });
  rmSync(configHome, { recursive: true, force: true });
});

describe("course.json declares the Lab 03 actions for the engine", () => {
  const { actions, indicators, sidecars } = ops.validateOperations(manifest, scripts);
  test("plan, up, status, down and verify (and prices) run the course Azure scripts", () => {
    expect(actions.map((a) => [a.id, a.script])).toEqual([
      ["azure-prices", "azure:prices"],
      ["azure-plan", "azure:plan"],
      ["azure-up", "azure:up"],
      ["azure-status", "azure:status"],
      ["azure-down", "azure:down"],
      ["azure-verify", "azure:verify"],
    ]);
    for (const a of actions) expect(scripts[a.script]).toBe(`node icode/azure.mjs ${a.script.split(":")[1]}`);
  });
  test("only set-up and shutdown are destructive, with time to clean up on cancel", () => {
    expect(actions.filter((a) => a.destructive).map((a) => a.id)).toEqual(["azure-up", "azure-down"]);
    for (const a of actions.filter((a) => a.destructive)) expect(a.cancelGraceSeconds).toBe(120);
  });
  test("cost banners are driven by the .azure markers and fail closed; a sidecar watches for lost state", () => {
    expect(indicators.map((i) => i.path)).toEqual(Object.values(COST_MARKERS));
    expect(indicators.every((i) => i.level === "danger")).toBe(true);
    expect(indicators.find((i) => i.path === COST_MARKERS.unknown).message).toMatch(/^Cost status unknown/);
    expect(sidecars).toEqual([{ name: "azure-cost-watch", script: "azure:watch" }]);
    expect(scripts["azure:watch"]).toBe("node icode/azure.mjs watch");
  });
});

describe("confirmation protocol", () => {
  const filter = (token) => {
    const text = [];
    const confirms = [];
    const f = ops.protocolFilter(token, (_type, t) => text.push(t), (c) => confirms.push(c));
    return { f, text, confirms };
  };
  test("a line with this run's token opens a typed confirmation", () => {
    const { f, text, confirms } = filter(TOKEN);
    f.push("stdout", confirmLine(TOKEN, "rg-saiel-course-abc123", "Delete it?") + "\n");
    expect(confirms).toEqual([{ expected: "rg-saiel-course-abc123", message: "Delete it?" }]);
    expect(text.join("")).not.toContain("::icode-confirm");
  });
  test("forged lines without the token, with another token or behind colour codes are ignored", () => {
    const { f, text, confirms } = filter(TOKEN);
    f.push("stdout", '::icode-confirm::{"expected":"create"}\n');
    f.push("stderr", confirmLine("tok_someoneelse0000", "create", "x") + "\n");
    f.push("stdout", '\x1b[31m::icode-confirm::{"expected":"create"}\n');
    expect(confirms).toEqual([]);
    expect(text.filter((t) => t.includes("ignored confirmation request")).length).toBe(3);
  });
});

describe("cost banner states", () => {
  test("no markers: no banner; each marker shows its banner", async () => {
    expect(await banners()).toEqual([]);
    for (const [path, pattern] of [
      [COST_MARKERS.env, /resources exist/],
      [COST_MARKERS.mayExist, /may exist/],
      [COST_MARKERS.unknown, /^Cost status unknown/],
    ]) {
      write(join(root, path), "{}");
      expect(await banners()).toEqual([expect.stringMatching(pattern)]);
      rmSync(join(root, path));
    }
  });
  test("an unreadable indicator configuration shows Cost status unknown, not nothing", async () => {
    const original = readFileSync(join(root, "course.json"), "utf8");
    try {
      writeFileSync(join(root, "course.json"), JSON.stringify({ ...manifest, indicators: [{ path: "../outside", message: "x" }] }));
      expect(await banners()).toEqual([expect.stringMatching(/^Cost status unknown/)]);
    } finally {
      writeFileSync(join(root, "course.json"), original);
    }
  });
});

describe.runIf(posix)("actions through the engine against a fake az", () => {
  test("set-up asks for “create” in the Icode dialog; cancelling creates nothing", async () => {
    const run = await act("azure-up", [""]);
    expect(run.confirms.map((c) => c.expected)).toEqual(["create"]);
    expect(run.status).toBe("failed");
    expect(run.output).toMatch(/Cancelled\. Nothing was created/);
    expect(calls("group create")).toEqual([]);
    expect(await banners()).toEqual([]);
    expect(existsSync(durable)).toBe(false);
  });

  test("set-up, status, shutdown and verify: banner on while resources exist, cleared only by a clean verify", async () => {
    const upRun = await act("azure-up", ["create"]);
    expect(upRun.status, upRun.output).toBe("passed");
    expect(groupsIn(SUB)).toHaveLength(1);
    expect(marker(COST_MARKERS.env)).toBe(true);
    expect(marker(COST_MARKERS.mayExist)).toBe(false);
    expect(JSON.parse(readFileSync(durable, "utf8"))).toMatchObject({ subscriptionId: SUB, resourceGroup: groupsIn(SUB)[0] });
    expect(await banners()).toEqual([expect.stringMatching(/resources exist/)]);
    expect(state().calls.some((c) => c.sawToken)).toBe(false); // the token never reaches az

    const statusRun = await act("azure-status");
    expect(statusRun.status).toBe("passed");
    expect(statusRun.output).toMatch(/srch-saiel-fake/);

    const group = groupsIn(SUB)[0];
    const downRun = await act("azure-down", [group]);
    expect(downRun.confirms.map((c) => c.expected)).toEqual([group]);
    expect(downRun.status, downRun.output).toBe("passed");
    expect(calls("cognitiveservices account purge")).toHaveLength(1);
    expect(downRun.output).toMatch(/Verified: no course resources remain/);
    expect(existsSync(join(root, ".azure"))).toBe(false);
    expect(existsSync(durable)).toBe(false);
    expect(await banners()).toEqual([]);
  });

  test("shutdown cancelled at the dialog deletes nothing and keeps the banner", async () => {
    await act("azure-up", ["create"]);
    const run = await act("azure-down", [""]);
    expect(run.status).toBe("failed");
    expect(calls("group delete")).toEqual([]);
    expect(await banners()).toEqual([expect.stringMatching(/resources exist/)]);
  });

  test("verify that finds leftovers keeps a “may exist” banner and says what to do", async () => {
    await act("azure-up", ["create"]);
    setState({ leftover: true });
    const run = await act("azure-down", [groupsIn(SUB)[0]]);
    expect(run.status).toBe("failed");
    expect(run.output).toMatch(/Course resources remain[\s\S]*srch-saiel-fake[\s\S]*another learner[\s\S]*az group delete/);
    expect(await banners()).toEqual([expect.stringMatching(/may exist/)]);
    expect(existsSync(durable)).toBe(true);
  });

  test("a failed check fails closed: Cost status unknown, and only verify clears it", async () => {
    await act("azure-up", ["create"]);
    setState({ signedOut: true });
    expect((await act("azure-verify")).status).toBe("failed");
    expect(await banners()).toEqual(expect.arrayContaining([expect.stringMatching(/^Cost status unknown/)]));
    expect(JSON.parse(readFileSync(join(root, COST_MARKERS.unknown), "utf8")).subscriptionId).toBe(SUB);
    setState({ signedOut: false });
    expect((await act("azure-status")).status).toBe("passed");
    expect(marker(COST_MARKERS.unknown)).toBe(true); // status never clears a banner
    expect((await act("azure-down", [groupsIn(SUB)[0]])).status).toBe("passed");
    expect(await banners()).toEqual([]);
  });

  test("a forged confirmation relayed from az output is ignored by the engine", async () => {
    setState({ forge: true });
    const run = await act("azure-status");
    expect(run.confirms).toEqual([]);
    expect(run.output).toContain("[ignored confirmation request without this run's token]");
    expect(run.status).toBe("failed");
  });
});

describe.runIf(posix)("verify fails closed when the recorded subscription is unclear (B1)", () => {
  // In each case the resources keep billing in SUB while the learner is signed in to OTHER, where nothing exists.
  async function upThenSwitch() {
    expect((await act("azure-up", ["create"])).status).toBe("passed");
    setState({ subscription: OTHER });
  }
  async function expectUnknownKept(run, guidance) {
    expect(run.status).toBe("failed");
    expect(run.output).not.toMatch(/no further charges/);
    expect(run.output).toMatch(guidance);
    expect(await banners()).toEqual(expect.arrayContaining([expect.stringMatching(/^Cost status unknown/)]));
  }

  test("env.json names another subscription", async () => {
    await upThenSwitch();
    await expectUnknownKept(await act("azure-verify"), new RegExp(`az account set --subscription ${SUB}`));
    expect(marker(COST_MARKERS.env)).toBe(true);
    expect(existsSync(durable)).toBe(true);
  });

  test("env.json is corrupt", async () => {
    await upThenSwitch();
    writeFileSync(join(root, COST_MARKERS.env), "{ not json");
    await expectUnknownKept(await act("azure-verify"), /env\.json cannot be read[\s\S]*azure:verify -- --subscription/);
    expect(readFileSync(join(root, COST_MARKERS.env), "utf8")).toBe("{ not json");
    expect(existsSync(durable)).toBe(true);
  });

  test("env.json has no subscription ID and the outside record is gone", async () => {
    await upThenSwitch();
    const env = JSON.parse(readFileSync(join(root, COST_MARKERS.env), "utf8"));
    delete env.subscriptionId;
    writeFileSync(join(root, COST_MARKERS.env), JSON.stringify(env));
    rmSync(durable);
    await expectUnknownKept(await act("azure-verify"), /does not say which subscription/);
    expect(marker(COST_MARKERS.env)).toBe(true);
  });

  test("only a cost-unknown marker without a subscription exists", async () => {
    write(join(root, COST_MARKERS.unknown), JSON.stringify({ reason: "earlier failure" }));
    await expectUnknownKept(await act("azure-verify"), /does not say which subscription/);
    expect(marker(COST_MARKERS.unknown)).toBe(true);
  });

  test("an explicit --subscription must be the signed-in one; an empty tag sweep there then clears", async () => {
    write(join(root, COST_MARKERS.unknown), JSON.stringify({ reason: "earlier failure" }));
    const mismatch = await direct(["verify", "--subscription", OTHER]);
    expect(mismatch.code).toBe(1);
    expect(mismatch.output).toMatch(/not the signed-in subscription/);
    expect(marker(COST_MARKERS.unknown)).toBe(true);

    const chosen = await direct(["verify", "--subscription", SUB]);
    expect(chosen.code, chosen.output).toBe(0);
    expect(chosen.output).toMatch(new RegExp(`This sweep covered only subscription ${SUB}[\\s\\S]*run Verify in each of them`));
    expect(calls("group list --tag")).not.toEqual([]);
    expect(calls("resource list --tag")).not.toEqual([]);
    expect(calls("cognitiveservices account list-deleted")).not.toEqual([]);
    expect(marker(COST_MARKERS.unknown)).toBe(false);
  });

  test("an explicit --subscription with something tagged in it keeps the banner", async () => {
    write(join(root, COST_MARKERS.unknown), JSON.stringify({ reason: "earlier failure" }));
    addGroup(SUB, "rg-saiel-course-cccccc", "learner@example.com");
    const run = await direct(["verify", "--subscription", SUB]);
    expect(run.code).toBe(1);
    expect(run.output).toMatch(/course-tagged resource group rg-saiel-course-cccccc/);
    expect(await banners()).toEqual([expect.stringMatching(/may exist/)]);
  });

  test("the sweep covers every course-tagged group in the subscription, not only the recorded one", async () => {
    await act("azure-up", ["create"]);
    addGroup(SUB, "rg-saiel-course-aaaaaa", "someone@example.com"); // another clone, or another learner
    const run = await act("azure-down", [groupsIn(SUB)[0]]);
    expect(run.status).toBe("failed");
    expect(run.output).toMatch(/course-tagged resource group rg-saiel-course-aaaaaa/);
    expect(await banners()).toEqual([expect.stringMatching(/may exist/)]);
  });
});

describe.runIf(posix)("recorded resource group and lost state (S2, S3)", () => {
  test("down uses the recorded group even when signed in as another user", async () => {
    await act("azure-up", ["create"]);
    const group = groupsIn(SUB)[0];
    setState({ user: "other@example.com" });
    const run = await act("azure-down", [group]);
    expect(run.confirms.map((c) => c.expected)).toEqual([group]);
    expect(run.status, run.output).toBe("passed");
    expect(groupsIn(SUB)).toEqual([]);
  });

  test("without any record, down sweeps by tag for groups you own and asks for each", async () => {
    await act("azure-up", ["create"]);
    const group = groupsIn(SUB)[0];
    rmSync(join(root, ".azure"), { recursive: true });
    rmSync(durable);
    addGroup(SUB, "rg-saiel-course-bbbbbb", "someone@example.com");
    const run = await act("azure-down", [group]);
    expect(run.confirms.map((c) => c.expected)).toEqual([group]); // never another owner's group
    expect(groupsIn(SUB)).toEqual(["rg-saiel-course-bbbbbb"]);
    expect(run.output).toMatch(/another learner/); // verify still reports the other group
  });

  test("with no record and two owned course groups, down asks for and deletes both in one run, then verifies", async () => {
    addGroup(SUB, "rg-saiel-course-111111", "learner@example.com");
    addGroup(SUB, "rg-saiel-course-222222", "learner@example.com");
    const run = await act("azure-down", ["rg-saiel-course-111111", "rg-saiel-course-222222"]);
    expect(run.confirms.map((c) => c.expected)).toEqual(["rg-saiel-course-111111", "rg-saiel-course-222222"]);
    expect(run.status, run.output).toBe("passed");
    expect(groupsIn(SUB)).toEqual([]);
    expect(run.output).toMatch(/Verified: no course resources remain/);
    expect(await banners()).toEqual([]);
  });

  test("cancelling the second of two confirmations keeps the second group and the banner", async () => {
    addGroup(SUB, "rg-saiel-course-111111", "learner@example.com");
    addGroup(SUB, "rg-saiel-course-222222", "learner@example.com");
    const run = await act("azure-down", ["rg-saiel-course-111111", ""]);
    expect(run.status).toBe("failed");
    expect(groupsIn(SUB)).toEqual(["rg-saiel-course-222222"]);
    expect(await banners()).toEqual([expect.stringMatching(/may exist/)]);
  });

  test("down refuses a recorded resource group that is not course-tagged", async () => {
    const s = state();
    s.worlds[SUB] = { groups: { "rg-shared-prod": { tags: { team: "payments" }, resources: [{ type: "Microsoft.Sql/servers", name: "sql" }] } }, deleted: [] };
    writeFileSync(stateFile, JSON.stringify(s));
    write(durable, JSON.stringify({ subscriptionId: SUB, resourceGroup: "rg-shared-prod" }));
    const run = await act("azure-down", ["rg-shared-prod"]);
    expect(run.status).toBe("failed");
    expect(run.confirms).toEqual([]);
    expect(run.output).toMatch(/rg-shared-prod is not tagged course=senior-ai-engineer-labs; refusing to delete it/);
    expect(calls("group delete")).toEqual([]);
    expect(groupsIn(SUB)).toEqual(["rg-shared-prod"]);
    expect(await banners()).toEqual([expect.stringMatching(/^Cost status unknown/)]);
  });

  test("deleting course/.azure brings back Cost status unknown from the record outside the checkout", async () => {
    await act("azure-up", ["create"]);
    rmSync(join(root, ".azure"), { recursive: true });
    expect(await banners()).toEqual([]); // nothing in the checkout any more…
    const watcher = spawn(process.execPath, [join(root, "icode/azure.mjs"), "watch"], { cwd: root, env: process.env, stdio: "ignore" });
    try {
      for (let i = 0; i < 50 && !marker(COST_MARKERS.unknown); i++) await new Promise((r) => setTimeout(r, 100));
    } finally {
      watcher.kill("SIGTERM");
    }
    expect(await banners()).toEqual([expect.stringMatching(/^Cost status unknown/)]); // …but the sidecar restores a banner
    expect(JSON.parse(readFileSync(join(root, COST_MARKERS.unknown), "utf8"))).toMatchObject({ subscriptionId: SUB, resourceGroup: groupsIn(SUB)[0] });
    // Every command restores it too, and verify then targets the recorded subscription.
    rmSync(join(root, ".azure"), { recursive: true });
    setState({ subscription: OTHER });
    const run = await act("azure-verify");
    expect(run.status).toBe("failed");
    expect(run.output).toMatch(new RegExp(`az account set --subscription ${SUB}`));
    expect(await banners()).toEqual([expect.stringMatching(/^Cost status unknown/)]);
  });
});

describe.runIf(posix)("azure.mjs outside the engine (S1)", () => {
  test("piped input is never a confirmation: no TTY and no token means nothing is created", async () => {
    const run = await direct("up", { input: "create\n" });
    expect(run.code).toBe(1);
    expect(run.output).toMatch(/cannot be piped/);
    expect(run.output).not.toContain("::icode-confirm");
    expect(calls("group create")).toEqual([]);
  });
  test("a token without an Icode action run is not trusted", async () => {
    const run = await direct("up", { input: "create\n", env: { ICODE_CONFIRM_TOKEN: TOKEN } });
    expect(run.code).toBe(1);
    expect(calls("group create")).toEqual([]);
  });
  test("the reviewer's path: echo create | ICODE_ACTION=1 ICODE_CONFIRM_TOKEN=… azure.mjs up is a pre-answer and creates nothing", async () => {
    const run = await direct("up", { input: "create\n", env: engineEnv });
    expect(run.code).toBe(1);
    expect(run.output).toMatch(/Input arrived before the confirmation was asked for/);
    expect(calls("group create")).toEqual([]);
    expect(existsSync(durable)).toBe(false);
  });
  test("the script re-checks the answer itself: a near miss after the prompt cancels", async () => {
    const run = await direct("up", { answer: "creat\n", env: engineEnv });
    expect(run.output).toContain(`::icode-confirm:${TOKEN}::{"expected":"create"`);
    expect(run.code).toBe(1);
    expect(run.output).toMatch(/Cancelled\. Nothing was created/);
    expect(calls("group create")).toEqual([]);
  });
});

describe.runIf(posix)("prices override (S4)", () => {
  let server, url, hits;
  beforeAll(async () => {
    server = createServer((req, res) => {
      hits++;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ Items: [{ type: "Consumption", skuName: "Basic", meterName: "Basic Unit", unitOfMeasure: "1 Hour", retailPrice: 9.99, currencyCode: "USD", armRegionName: "swedencentral" }] }));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    url = `http://127.0.0.1:${server.address().port}/prices`;
  });
  beforeEach(() => (hits = 0));
  afterAll(() => new Promise((r) => server.close(r)));

  test("honoured for the read-only prices command with live Azure off, and announced", async () => {
    const run = await direct("prices", { env: { ICODE_AZURE_PRICES_API: url } });
    expect(run.output).toMatch(/prices overridden for a test/);
    expect(run.output).toMatch(/9\.99 USD\/hour/);
    expect(hits).toBeGreaterThan(0);
  });
  test("ignored for a host that only looks like loopback", async () => {
    const lookalike = url.replace("127.0.0.1", "localhost.evil.invalid");
    const run = await direct("prices", { env: { ICODE_AZURE_PRICES_API: lookalike } });
    expect(run.output).not.toMatch(/overridden|9\.99/);
    expect(hits).toBe(0);
  }, 180000);
  test("ignored for the prices command unless live Azure is off", async () => {
    const run = await direct("prices", { env: { ICODE_AZURE_PRICES_API: url, ICODE_AZURE_LIVE: "" } });
    expect(run.output).not.toMatch(/overridden|9\.99/);
    expect(hits).toBe(0);
  }, 180000);
  test("never used for the price shown before “create”, with live Azure off or on", async () => {
    const live = await direct("plan", { env: { ICODE_AZURE_PRICES_API: url, ICODE_AZURE_LIVE: "" } });
    expect(live.output).not.toMatch(/overridden|9\.99/);
    const plan = await direct("plan", { env: { ICODE_AZURE_PRICES_API: url } });
    expect(plan.output).not.toMatch(/overridden|9\.99/);
    expect(hits).toBe(0);
  });
});

describe("offline guard", () => {
  test("the guard refuses non-loopback requests, in the test worker and in azure.mjs processes", async () => {
    await expect(fetch("https://example.com/")).rejects.toThrow(/offline test refused/);
    const child = await new Promise((done) => {
      const p = spawn(process.execPath, ["-e", "fetch('https://example.com/').then(() => console.log('reached'), (e) => console.log(e.message))"], { env: process.env });
      let out = "";
      p.stdout.on("data", (x) => (out += x));
      p.on("close", () => done(out));
    });
    expect(child).toMatch(/offline test refused/);
    writeFileSync(networkLog, readFileSync(networkLog, "utf8").replace(/^blocked https:\/\/example\.com\n/gm, ""));
  });
  test("plan reads list prices through the real Retail Prices URL, served by the loopback fake", async () => {
    const run = await direct("plan");
    expect(run.output).toMatch(/0\.42 USD\/hour/);
    expect(readFileSync(networkLog, "utf8")).toMatch(/rewrote https:\/\/prices\.azure\.com\/api\/retail\/prices/);
  });
  test("no test in this suite tried to reach the network", () => {
    expect(readFileSync(networkLog, "utf8").split("\n").filter((l) => l.startsWith("blocked"))).toEqual([]);
  });
});
