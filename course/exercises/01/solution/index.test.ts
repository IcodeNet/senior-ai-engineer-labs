import { test } from "vitest";
import assert from "node:assert/strict";
import { atLeast, parseVersion, readiness, summary, type Facts } from "./index.ts";

const PIN = "c4099e4f2e43805cd1cc1797960fbb72bc006bd3";
const healthy: Facts = {
  node: "v22.13.0",
  npm: "10.9.2",
  git: "git version 2.47.1",
  engineCommit: PIN,
  pinnedCommit: PIN,
  azureCli: "2.67.0",
  azureMarkers: [],
};
const status = (facts: Facts, id: string) => readiness(facts).checks.find((c) => c.id === id)?.status;

test("parseVersion reads node, npm and git version strings", () => {
  assert.deepEqual(parseVersion("v22.13.0"), [22, 13, 0]);
  assert.deepEqual(parseVersion("git version 2.47.1"), [2, 47, 1]);
  assert.deepEqual(parseVersion("24.1"), [24, 1, 0]);
  assert.throws(() => parseVersion("not installed"), /Not a version/);
});

test("atLeast compares numerically, not as text", () => {
  assert.equal(atLeast([22, 13, 0], [22, 13, 0]), true);
  assert.equal(atLeast([22, 9, 9], [22, 13, 0]), false, "9 < 13 even though '9' > '1' as text");
  assert.equal(atLeast([23, 0, 0], [22, 13, 0]), true);
});

test("a healthy machine is ready, not billable, and every check passes", () => {
  const report = readiness(healthy);
  assert.equal(report.ready, true);
  assert.equal(report.billable, false);
  assert.deepEqual(report.checks.map((c) => c.id), ["node", "npm", "git", "engine", "azure-cli", "cost"]);
  assert.ok(report.checks.every((c) => c.status === "pass"));
});

test("an old Node.js, missing npm or missing git fail the check", () => {
  assert.equal(status({ ...healthy, node: "v22.12.0" }, "node"), "fail");
  assert.equal(status({ ...healthy, node: "" }, "node"), "fail");
  assert.equal(status({ ...healthy, npm: null }, "npm"), "fail");
  assert.equal(status({ ...healthy, git: null }, "git"), "fail");
  assert.equal(readiness({ ...healthy, git: null }).ready, false);
});

test("a missing engine fails and points at setup; a different engine only warns", () => {
  const missing = readiness({ ...healthy, engineCommit: null }).checks.find((c) => c.id === "engine");
  assert.equal(missing?.status, "fail");
  assert.match(missing?.message ?? "", /npm run setup/);
  assert.equal(status({ ...healthy, engineCommit: "0123456789abcdef" }, "engine"), "warn");
});

test("no Azure CLI is a warning, because the offline modules do not need it", () => {
  const report = readiness({ ...healthy, azureCli: null });
  assert.equal(status({ ...healthy, azureCli: null }, "azure-cli"), "warn");
  assert.equal(report.ready, true);
});

test("any cost marker makes the report billable and names the shutdown actions", () => {
  for (const marker of ["env.json", "resources-may-exist.json", "cost-status-unknown.json"]) {
    const report = readiness({ ...healthy, azureMarkers: [marker] });
    assert.equal(report.billable, true, marker);
    const cost = report.checks.find((c) => c.id === "cost");
    assert.equal(cost?.status, "warn");
    assert.match(cost?.message ?? "", /Shut down Azure[\s\S]*Verify cost is zero/);
  }
  assert.equal(readiness({ ...healthy, azureMarkers: ["notes.txt"] }).billable, false, "unrelated files are not markers");
});

test("summary prints one line per check and a verdict", () => {
  const text = summary(readiness({ ...healthy, npm: null }));
  assert.equal(text.split("\n").length, 7);
  assert.match(text, /^✔ node: Node\.js 22\.13\.0$/m);
  assert.match(text, /^✖ npm: /m);
  assert.match(text, /Not ready/);
});
