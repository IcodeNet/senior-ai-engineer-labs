// Course acceptance through the pinned Icode Workshop engine.
// Every starter must fail, every solution must pass, and the learner journey must work end to end.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Acceptance never calls Azure: live tests in the real-Azure steps are disabled here.
process.env.ICODE_AZURE_LIVE = "0";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const engine = resolve(root, process.env.ICODE_ENGINE_DIR || ".icode/engine");
const load = (path) => import(pathToFileURL(join(engine, path)));
const { discoverSteps } = await load("packages/core/layout.mjs");
const { courseConfig, readProgress, updateProgress } = await load("packages/web/course.mjs");
const { testLab, labConfig } = await load("packages/web/runtime.mjs");
const { executionWorkspace } = await load("packages/web/variants.mjs");
const { selectWorkspace, replaceWorkspace } = await load("packages/web/workspaces.mjs");
const { readProjectFile, writeProjectFile } = await load("packages/web/files.mjs");

const pin = JSON.parse(await readFile(join(root, "icode/engine.json"), "utf8"));
const engineHead = (await readFile(join(engine, ".git/HEAD"), "utf8").catch(() => "")).trim();
if (!process.env.ICODE_ENGINE_DIR) assert.equal(engineHead, pin.commit, "engine checkout must match icode/engine.json");

const steps = discoverSteps(root);
const course = await courseConfig(root);
assert.deepEqual(course.ids, steps.map((step) => step.id), "course.json must list every step exactly once, in order");

const hash = (text) => createHash("sha256").update(text).digest("hex");
async function authoredHashes() {
  const result = {};
  for (const name of await readdir(join(root, "exercises"), { recursive: true }))
    if (!name.includes("node_modules") && /\.(ts|json|md)$/.test(name))
      result[name] = hash(await readFile(join(root, "exercises", name)));
  return result;
}
const before = await authoredHashes();

const results = [];
for (const step of steps) {
  const config = await labConfig(root, step.id);
  assert.equal(config.testScript, "test", `${step.id} must run its Vitest package script`);
  const readme = await readFile(join(step.base, "README.md"), "utf8");
  assert.match(readme, /^# /, `${step.id} needs a lesson README`);
  // Foundation lessons use the step template (check questions); advanced lessons keep an interview question.
  assert.match(readme, /^## (Interview question|Check questions)$/m, `${step.id} lesson needs check questions or an interview question`);
  for (const variant of ["problem", "solution"]) {
    const workspace = await executionWorkspace(root, step.id, variant);
    try {
      const result = await testLab(root, step.id, { workspaceRoot: workspace.path, timeoutMs: 60000 });
      const expected = variant === "solution" ? "passed" : "failed";
      const tests = result.output.replace(/\x1b\[[0-9;]*m/g, "").match(/^\s*Tests\s+[^\n(]*/m);
      results.push({ id: step.id, variant, status: result.status, exitCode: result.exitCode, tests: tests?.[0]?.trim() });
      console.log(`${step.id} ${variant}: ${result.status}${tests ? ` (${tests[0].trim()})` : ""}`);
      assert.equal(result.status, expected, `${step.id} ${variant} must have ${expected}:\n${result.output.slice(-3000)}`);
      if (variant === "problem") assert.match(result.output, /Not implemented/, `${step.id} starter must fail on the unimplemented code, not on setup`);
    } finally {
      await workspace.cleanup();
    }
  }
}

// Learner journey on the first step: starter fails, an edit passes, reset and restore behave, progress persists.
const id = steps[0].id;
const entry = (await labConfig(root, id)).entry;
await selectWorkspace(root, id);
await replaceWorkspace(root, id); // start from the authored starter even if an earlier run left learner work behind
const starter = await readProjectFile(root, id, entry);
assert.equal(starter, await readProjectFile(root, id, entry, "problem"), "playground must start as the authored starter");
assert.equal((await testLab(root, id)).passed, false, "fresh playground must fail");
const solution = await readProjectFile(root, id, entry, "solution");
await writeProjectFile(root, id, entry, solution);
assert.equal((await testLab(root, id)).passed, true, "learner edit must pass");
const reset = await replaceWorkspace(root, id);
assert.equal(await readProjectFile(root, id, entry), starter, "reset must restore the starter");
assert.equal((await testLab(root, id)).passed, false, "reset playground must fail again");
await replaceWorkspace(root, id, { backup: reset.backup.split(/[\\/]/).at(-1) });
assert.equal((await testLab(root, id)).passed, true, "restoring the backup must bring back learner work");
await updateProgress(root, id, true);
assert.ok((await readProgress(root)).completed.includes(id), "progress must persist");
await selectWorkspace(root, steps[1].id);
await selectWorkspace(root, id);
assert.equal(await readProjectFile(root, id, entry), solution, "playground must persist across lesson switches");
await updateProgress(root, id, false);
await replaceWorkspace(root, id); // leave the authored starter for anything that runs next (e.g. browser acceptance)
assert.equal(await readProjectFile(root, id, entry), starter, "journey must leave the starter in place");

assert.deepEqual(await authoredHashes(), before, "authored exercise sources must not change");

const evidence = {
  engine: pin.commit,
  course: course.title,
  steps: steps.length,
  results,
  learnerJourney: ["fresh fails", "edit passes", "reset restores starter", "backup restore", "progress persists", "playground persists"],
  authoredSourcesUnchanged: true,
};
await mkdir(join(root, "acceptance-results"), { recursive: true });
await writeFile(join(root, "acceptance-results/icode.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(`Acceptance passed: ${steps.length} steps, ${results.length} variants, learner journey through engine ${pin.commit.slice(0, 7)}.`);
