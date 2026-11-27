#!/usr/bin/env node
// Runs the pinned Icode Workshop engine against this course.
import { spawnSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engine = resolve(root, process.env.ICODE_ENGINE_DIR || ".icode/engine");
const command = process.argv[2] || "start";
const pin = JSON.parse(readFileSync(join(root, "icode/engine.json"), "utf8"));

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${result.status}`);
}

if (command === "setup" && !process.env.ICODE_ENGINE_DIR) {
  if (!existsSync(join(engine, ".git"))) {
    mkdirSync(dirname(engine), { recursive: true });
    run("git", ["clone", "--no-checkout", pin.repository, engine], root);
  }
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: engine, encoding: "utf8" }).stdout?.trim();
  if (head !== pin.commit || !existsSync(join(engine, "package.json"))) {
    if (head !== pin.commit) run("git", ["fetch", "--quiet", "origin", pin.commit], engine);
    run("git", ["checkout", "--quiet", "--detach", pin.commit], engine);
  }
}
if (!existsSync(join(engine, "package.json")))
  throw new Error("Run `npm run setup` first, or set ICODE_ENGINE_DIR to an Icode Workshop checkout.");
if (command === "setup" && !existsSync(join(engine, "node_modules"))) {
  if (process.platform === "win32") run("cmd.exe", ["/d", "/s", "/c", "corepack pnpm install --frozen-lockfile"], engine);
  else run("corepack", ["pnpm", "install", "--frozen-lockfile"], engine);
}

const child = spawn(process.execPath, [join(engine, "packages/cli/bin.mjs"), ...process.argv.slice(2), "--content", root], {
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
