// Browser acceptance: the real Icode UI serves this course, every lesson opens,
// and a learner can turn a failing playground into a passing one. Run in CI.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { dirname, join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
// Azure is never reached: live tests are off, and az gets an empty config directory, so it is signed out.
// The Lab 03 state record outside the checkout goes to a throwaway config directory, never the learner's own.
const azureConfig = await mkdtemp(join(tmpdir(), "icode-no-azure-"));
const configHome = await mkdtemp(join(tmpdir(), "icode-config-"));
const outsideRecord = join(configHome, "icode-workshop", "senior-ai-engineer-labs-azure.json");
const child = spawn(process.execPath, ["icode/run.mjs", "start"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ICODE_AZURE_LIVE: "0", AZURE_CONFIG_DIR: azureConfig, XDG_CONFIG_HOME: configHome } });
const closed = once(child, "close");
let logs = "";
for (const stream of [child.stdout, child.stderr]) stream.on("data", (x) => (logs = (logs + x).slice(-8000)));
const evidence = [];
let browser;

async function ready(url) {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(300) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Workshop did not start:\n" + logs);
}
async function until(check, message, attempts = 300) {
  for (let i = 0; i < attempts; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(message);
}
async function released(port) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((r) => server.close(r));
}

try {
  await mkdir(join(root, "acceptance-results"), { recursive: true });
  const course = JSON.parse(await readFile(join(root, "course.json"), "utf8"));
  const ids = course.modules.flatMap((m) => m.exercises.flatMap((e) => e.steps));
  await ready("http://127.0.0.1:5173/");
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  await page.goto("http://127.0.0.1:5173/");

  const lessons = page.locator("button.exercise");
  await lessons.first().waitFor();
  assert.equal(await lessons.count(), ids.length, "sidebar must list every step");
  for (const [index, id] of ids.entries()) {
    const { title } = JSON.parse(await readFile(join(root, "exercises", id, "lab.json"), "utf8"));
    await lessons.nth(index).click();
    await until(async () => (await page.locator(".heading h1").textContent()) === title, `step ${id} heading must be "${title}"`);
    await page.locator(".lesson-panel").getByRole("heading", { name: "Interview question" }).waitFor();
  }
  evidence.push(`All ${ids.length} lessons open with their title and interview question`);

  await lessons.first().click();
  await until(async () => (await page.locator(".heading h1").textContent()) === "Chunking with governance metadata", "step 01 must reopen");
  const status = page.locator('pre.notice[role="status"]').first();
  const runTests = page.getByRole("button", { name: "Run tests", exact: true });
  await until(() => runTests.isEnabled(), "Run tests must become available");
  await runTests.click();
  await until(async () => /^(PASS|FAIL)/.test((await status.textContent()) ?? ""), "tests must finish in the browser");
  assert.match((await status.textContent()) ?? "", /^FAIL[\s\S]*Not implemented/, "starter must fail on unimplemented code in the browser");
  evidence.push("Starter fails when tests run from the UI");

  const editor = page.getByRole("textbox", { name: "Playground code editor" });
  for (let i = 0; !(await editor.isVisible()); i++) {
    if (i === 20) throw new Error("playground editor did not open");
    await page.getByRole("tab", { name: "Playground", exact: true }).click();
    await page.waitForTimeout(300);
  }
  await until(async () => (await editor.inputValue()).includes("Not implemented: chunkDocument"), "editor must show the starter index.ts");
  await editor.fill(await readFile(join(root, "exercises/01/solution/index.ts"), "utf8"));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await until(async () => (await readFile(join(root, ".workshop/playgrounds/01/index.ts"), "utf8")).includes("chunks.push"), "save must write the playground file");
  await runTests.click();
  await until(async () => !/^FAIL/.test((await status.textContent()) ?? ""), "the second run must replace the earlier output");
  await until(async () => /^(PASS|FAIL)/.test((await status.textContent()) ?? ""), "tests must finish again in the browser");
  assert.match((await status.textContent()) ?? "", /^PASS/, "edited playground must pass in the browser");
  evidence.push("Editing and saving in the browser turns the failing playground into a passing one");
  await page.screenshot({ path: join(root, "acceptance-results/course.png"), fullPage: true });

  // Lab 03 course actions: listed in the Actions tab, set-up and shutdown marked destructive.
  await page.getByRole("tab", { name: /^Actions/ }).click();
  const lab03 = page.getByRole("region", { name: "Lab 03 · Real Azure" });
  for (const action of course.actions) await lab03.getByRole("button", { name: action.label, exact: true }).waitFor();
  assert.equal(await lab03.locator(".badge.danger").count(), 2, "set-up and shutdown must be marked destructive");
  evidence.push(`Actions tab lists the ${course.actions.length} Lab 03 actions; set-up and shutdown are marked destructive`);
  // Plan runs from the UI; with az signed out (or absent) it stops before reading any subscription.
  await lab03.getByRole("button", { name: course.actions.find((a) => a.id === "azure-plan").label, exact: true }).click();
  const actionOutput = page.getByRole("log", { name: "Action output" });
  await until(async () => /Not signed in to Azure|Azure CLI not found/.test((await actionOutput.textContent()) ?? ""), "plan must run from the Actions tab and report the missing sign-in");
  await until(async () => /· failed/.test((await page.locator(".actions-panel .execution-summary").textContent()) ?? ""), "plan run must finish");
  evidence.push("“Plan Azure set-up” runs from the Actions tab and stops at the missing az sign-in (no Azure call)");
  await page.screenshot({ path: join(root, "acceptance-results/actions.png"), fullPage: true });

  // Cost banner fails closed. Only exercised when this checkout has no real Azure state: a state record outside the
  // checkout with no course/.azure (as after `git clean`) makes the azure-cost-watch sidecar restore "Cost status unknown".
  if (!existsSync(join(root, ".azure"))) {
    const banner = page.getByRole("region", { name: "Course status" });
    const bannerText = async () => ((await banner.count()) ? ((await banner.textContent()) ?? "") : "");
    try {
      await mkdir(dirname(outsideRecord), { recursive: true });
      await writeFile(outsideRecord, JSON.stringify({ subscriptionId: "00000000-0000-0000-0000-000000000000", resourceGroup: "rg-saiel-course-browser" }));
      await until(async () => {
        await page.reload();
        await page.locator("button.exercise").first().waitFor();
        return /Cost status unknown/.test(await bannerText());
      }, "the sidecar must restore a Cost status unknown banner when course/.azure is missing", 30);
      await page.screenshot({ path: join(root, "acceptance-results/cost-banner.png") });
    } finally {
      await rm(outsideRecord, { force: true });
      await rm(join(root, ".azure"), { recursive: true, force: true });
    }
    await page.reload();
    await page.locator("button.exercise").first().waitFor();
    await until(async () => (await banner.count()) === 0, "the banner must clear when the state is gone", 200);
    evidence.push("With only the outside state record, the azure-cost-watch sidecar restores “Cost status unknown”; it clears when the state is gone");
  } else evidence.push("Cost banner check skipped: this checkout has real .azure state");
} finally {
  await browser?.close();
  if (child.exitCode === null) child.kill("SIGTERM");
  await closed;
  await rm(azureConfig, { recursive: true, force: true });
  await rm(configHome, { recursive: true, force: true });
}
for (const port of [4317, 5173]) await released(port);
evidence.push("Stopping the workshop releases ports 4317 and 5173");
await writeFile(join(root, "acceptance-results/browser.json"), JSON.stringify({ evidence }, null, 2) + "\n");
console.log(evidence.join("\n"));
