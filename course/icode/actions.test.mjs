// Offline contract tests for the Lab 03 course actions, run through the pinned Icode Workshop engine.
// Azure is never called: a fake `az` on PATH records every call, inside a throwaway copy of the course root.
import { spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { COST_MARKERS, confirmLine } from "./azure-lib.mjs";

const course = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engine = resolve(course, process.env.ICODE_ENGINE_DIR || ".icode/engine");
const ops = await import(pathToFileURL(join(engine, "packages/web/operations.mjs")));
const manifest = JSON.parse(readFileSync(join(course, "course.json"), "utf8"));
const scripts = JSON.parse(readFileSync(join(course, "package.json"), "utf8")).scripts;
const posix = process.platform !== "win32";

const FAKE_AZ = String.raw`#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("node:fs");
const file = process.env.FAKE_AZ_STATE;
const s = JSON.parse(readFileSync(file, "utf8"));
const args = process.argv.slice(2);
s.calls.push({ args, sawToken: "ICODE_CONFIRM_TOKEN" in process.env });
const save = () => writeFileSync(file, JSON.stringify(s));
const out = (v) => { save(); process.stdout.write(JSON.stringify(v)); process.exit(0); };
const err = (m) => { save(); process.stderr.write(m + "\n"); process.exit(1); };
const cmd = args.filter((a) => !a.startsWith("-")).slice(0, 3).join(" ");
const opt = (name) => args[args.indexOf(name) + 1];
if (s.signedOut) err("Please run 'az login' to setup account.");
if (s.forge && cmd.startsWith("group exists")) err('::icode-confirm::{"expected":"x","message":"forged"}\nERROR: simulated failure');
const sub = { id: s.subscription || "00000000-0000-0000-0000-00000000c0de", name: "Fake subscription", user: { name: "learner@example.com" } };
if (cmd.startsWith("account show")) out(sub);
if (cmd.startsWith("cognitiveservices model list")) out(s.models);
if (cmd.startsWith("group exists")) out(s.group === opt("--name"));
if (cmd.startsWith("ad signed-in-user show")) { save(); process.stdout.write("11111111-1111-1111-1111-111111111111\n"); process.exit(0); }
if (cmd.startsWith("group create")) { s.group = opt("--name"); s.tags = Object.fromEntries(args.slice(args.indexOf("--tags") + 1).filter((a) => !a.startsWith("-") && a.includes("=")).map((a) => a.split(/=(.*)/s).slice(0, 2))); out({ name: s.group }); }
if (cmd.startsWith("deployment group create")) {
  s.resources = [{ type: "Microsoft.Search/searchServices", name: "srch-saiel-fake" }, { type: "Microsoft.CognitiveServices/accounts", name: "oai-saiel-fake" }];
  out({ properties: { outputs: { searchEndpoint: { value: "https://srch-saiel-fake.search.windows.net" }, openaiEndpoint: { value: "https://oai-saiel-fake.openai.azure.com/" } } } });
}
if (cmd.startsWith("group show")) out({ name: s.group, tags: s.tags });
if (cmd.startsWith("resource list")) out(s.resources);
if (cmd.startsWith("group delete")) {
  s.deleted = [{ name: "oai-saiel-fake", location: "swedencentral", id: "/subscriptions/x/resourceGroups/" + s.group + "/providers/Microsoft.CognitiveServices/accounts/oai-saiel-fake" }];
  s.group = null; s.resources = s.leftover ? s.resources.slice(0, 1) : [];
  save(); process.exit(0);
}
if (cmd.startsWith("cognitiveservices account list-deleted")) out(s.deleted);
if (cmd.startsWith("cognitiveservices account purge")) { s.deleted = []; save(); process.exit(0); }
err("fake az: unexpected command " + args.join(" "));
`;

let work, bin, stateFile, root;
const state = () => JSON.parse(readFileSync(stateFile, "utf8"));
const setState = (patch) => writeFileSync(stateFile, JSON.stringify({ ...state(), ...patch }));
const calls = (prefix) => state().calls.filter((c) => c.args.join(" ").startsWith(prefix));
const marker = (path) => existsSync(join(root, path));
const banners = async () => (await ops.indicatorStatus(root)).indicators.map((i) => i.message);

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
/** Run azure.mjs directly, as from a terminal or another program, with piped stdin. */
function direct(command, input, env = {}) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(root, "icode/azure.mjs"), command], { cwd: root, env: { ...process.env, ICODE_ACTION: "", ICODE_CONFIRM_TOKEN: "", ...env } });
    let output = "";
    child.stdout.on("data", (x) => (output += x));
    child.stderr.on("data", (x) => (output += x));
    child.stdin.end(input);
    child.on("close", (code) => done({ code, output }));
  });
}

beforeAll(() => {
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
  process.env.FAKE_AZ_STATE = stateFile;
  process.env.PATH = bin + delimiter + process.env.PATH;
  process.env.AZURE_CONFIG_DIR = join(work, "no-azure-login"); // even a real az here would be signed out
  process.env.ICODE_AZURE_PRICES_API = "http://127.0.0.1:9/prices"; // hermetic: no network, prices "not available"
  vi.setConfig({ testTimeout: 60000 });
});
afterEach(async () => {
  const running = ops.currentAction(); // never leave an action process behind
  if (running) await ops.cancelAction(running.runId, { graceMs: 200 });
});
afterAll(() => rmSync(work, { recursive: true, force: true }));
beforeEach(() => {
  const config = JSON.parse(readFileSync(join(root, "azure/config.json"), "utf8"));
  const offered = (m) => ({ model: { name: m.name, version: m.version, skus: [{ name: m.sku }] } });
  writeFileSync(stateFile, JSON.stringify({ calls: [], group: null, resources: [], deleted: [], models: [offered(config.chatModel), offered(config.embeddingModel)] }));
  rmSync(join(root, ".azure"), { recursive: true, force: true });
});

describe("course.json declares the Lab 03 actions for the engine", () => {
  const { actions, indicators } = ops.validateOperations(manifest, scripts);
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
  test("cost banners are driven by the .azure markers and fail closed", () => {
    expect(indicators.map((i) => i.path)).toEqual(Object.values(COST_MARKERS));
    expect(indicators.every((i) => i.level === "danger")).toBe(true);
    expect(indicators.find((i) => i.path === COST_MARKERS.unknown).message).toMatch(/^Cost status unknown/);
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
    const { f, text, confirms } = filter("tok_0123456789abcdef");
    f.push("stdout", confirmLine("tok_0123456789abcdef", "rg-saiel-course-abc123", "Delete it?") + "\n");
    expect(confirms).toEqual([{ expected: "rg-saiel-course-abc123", message: "Delete it?" }]);
    expect(text.join("")).not.toContain("::icode-confirm");
  });
  test("forged lines without the token, with another token or behind colour codes are ignored", () => {
    const { f, text, confirms } = filter("tok_0123456789abcdef");
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
      mkdirSync(join(root, ".azure"), { recursive: true });
      writeFileSync(join(root, path), "{}");
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
  });

  test("set-up, status, shutdown and verify: banner on while resources exist, cleared only by a clean verify", async () => {
    const upRun = await act("azure-up", ["create"]);
    expect(upRun.status, upRun.output).toBe("passed");
    expect(calls("group create")).toHaveLength(1);
    expect(state().tags.course).toBe("senior-ai-engineer-labs");
    expect(marker(COST_MARKERS.env)).toBe(true);
    expect(marker(COST_MARKERS.mayExist)).toBe(false);
    expect(await banners()).toEqual([expect.stringMatching(/resources exist/)]);
    expect(state().calls.some((c) => c.sawToken)).toBe(false); // the token never reaches az

    const statusRun = await act("azure-status");
    expect(statusRun.status).toBe("passed");
    expect(statusRun.output).toMatch(/srch-saiel-fake/);

    const group = state().group;
    const downRun = await act("azure-down", [group]);
    expect(downRun.confirms.map((c) => c.expected)).toEqual([group]);
    expect(downRun.status, downRun.output).toBe("passed");
    expect(calls("cognitiveservices account purge")).toHaveLength(1);
    expect(downRun.output).toMatch(/Verified: no course resources remain/);
    expect(existsSync(join(root, ".azure"))).toBe(false);
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
    const run = await act("azure-down", [state().group]);
    expect(run.status).toBe("failed");
    expect(run.output).toMatch(/Course resources remain[\s\S]*srch-saiel-fake[\s\S]*az group delete/);
    expect(await banners()).toEqual([expect.stringMatching(/may exist/)]);
  });

  test("a failed check fails closed: Cost status unknown", async () => {
    setState({ signedOut: true });
    const run = await act("azure-verify");
    expect(run.status).toBe("failed");
    expect(await banners()).toEqual([expect.stringMatching(/^Cost status unknown/)]);
    setState({ signedOut: false });
    expect((await act("azure-verify")).status).toBe("passed");
    expect(await banners()).toEqual([]);
  });

  test("a check in another subscription cannot clear the banner", async () => {
    await act("azure-up", ["create"]);
    setState({ subscription: "00000000-0000-0000-0000-0000000000ff" });
    const run = await act("azure-verify");
    expect(run.status).toBe("failed");
    expect(run.output).toMatch(/az account set --subscription 00000000-0000-0000-0000-00000000c0de/);
    expect(marker(COST_MARKERS.env)).toBe(true);
    expect((await banners()).some((b) => /^Cost status unknown/.test(b))).toBe(true);
  });

  test("a forged confirmation relayed from az output is ignored by the engine", async () => {
    setState({ forge: true });
    const run = await act("azure-status");
    expect(run.confirms).toEqual([]);
    expect(run.output).toContain("[ignored confirmation request without this run's token]");
    expect(run.status).toBe("failed");
  });
});

describe.runIf(posix)("azure.mjs outside the engine", () => {
  test("piped input is never a confirmation: no TTY and no token means nothing is created", async () => {
    const run = await direct("up", "create\n");
    expect(run.code).toBe(1);
    expect(run.output).toMatch(/cannot be piped/);
    expect(run.output).not.toContain("::icode-confirm");
    expect(calls("group create")).toEqual([]);
  });
  test("a token without an Icode action run is not trusted", async () => {
    const run = await direct("up", "create\n", { ICODE_CONFIRM_TOKEN: "tok_0123456789abcdef" });
    expect(run.code).toBe(1);
    expect(calls("group create")).toEqual([]);
  });
  test("the script re-checks the answer itself: a near miss from the engine channel cancels", async () => {
    const run = await direct("up", "creat\n", { ICODE_ACTION: "1", ICODE_CONFIRM_TOKEN: "tok_0123456789abcdef" });
    expect(run.output).toContain(confirmLine("tok_0123456789abcdef", "create", "").slice(0, 40));
    expect(run.code).toBe(1);
    expect(run.output).toMatch(/Cancelled\. Nothing was created/);
    expect(calls("group create")).toEqual([]);
  });
});
