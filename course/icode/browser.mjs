// Browser acceptance: the real Icode UI serves this course, every lesson opens,
// and a learner can turn a failing playground into a passing one. Run in CI.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const child = spawn(process.execPath, ["icode/run.mjs", "start"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
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
} finally {
  await browser?.close();
  if (child.exitCode === null) child.kill("SIGTERM");
  await closed;
}
for (const port of [4317, 5173]) await released(port);
evidence.push("Stopping the workshop releases ports 4317 and 5173");
await writeFile(join(root, "acceptance-results/browser.json"), JSON.stringify({ evidence }, null, 2) + "\n");
console.log(evidence.join("\n"));
