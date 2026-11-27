import { test } from "vitest";
import assert from "node:assert/strict";
import { minimumRetentionDays, regionGeography, reviewDesign, verdict, type ArchitectureSpec, type Finding } from "./index.ts";

// A synthetic, well-controlled design for an internal advisor assistant.
function compliant(): ArchitectureSpec {
  return {
    name: "advisor-assistant",
    classification: "confidential",
    dataResidency: "eu",
    components: [
      { id: "chat-model", kind: "llm", region: "swedencentral" },
      { id: "search", kind: "vector-store", region: "West Europe" },
      { id: "audit-log", kind: "log-store", region: "eu" },
    ],
    tools: [
      { id: "lookup-policy", sideEffect: "read", requiresApproval: false },
      { id: "send-client-email", sideEffect: "write", requiresApproval: true },
    ],
    audit: { logsPrompts: true, logsToolCalls: true, redactsPii: true, retentionDays: 2555, maxRetentionDays: 2555 },
    injection: { untrustedInputs: ["retrieved-documents", "client-email"], separatesInstructions: true, validatesToolArguments: true },
    cost: { maxTokensPerRequest: 8000, hardMonthlyCap: true },
    retrieval: { enforcesAccessInBackend: true },
  };
}

const keys = (findings: Finding[]) => findings.map(f => `${f.severity} ${f.control} ${f.subject}`);

test("a design with every control in place has no findings and is approved", () => {
  const findings = reviewDesign(compliant());
  assert.deepEqual(findings, []);
  assert.equal(verdict(findings), "approve");
});

test("components outside the residency region are flagged; no requirement means no finding", () => {
  const spec = compliant();
  assert.equal(regionGeography(" West Europe "), "eu");
  assert.equal(regionGeography("EU"), "eu");
  spec.components[0].region = "eastus";
  spec.components[1].region = "global";
  assert.deepEqual(keys(reviewDesign(spec)), ["high data-residency chat-model", "high data-residency search"]);
  assert.deepEqual(reviewDesign({ ...spec, dataResidency: null }), []);
});

test("write and payment tools need approval, audit of tool calls and validated arguments", () => {
  const spec = compliant();
  spec.tools.push({ id: "execute-trade", sideEffect: "payment", requiresApproval: false });
  spec.audit.logsToolCalls = false;
  spec.injection.validatesToolArguments = false;
  assert.deepEqual(keys(reviewDesign(spec)), [
    "high audit tool-calls",
    "high human-approval execute-trade",
    "high prompt-injection tool-arguments",
  ]);
  const readOnly = compliant();
  readOnly.tools = [{ id: "lookup-policy", sideEffect: "read", requiresApproval: false }];
  readOnly.audit.logsToolCalls = false;
  readOnly.injection.validatesToolArguments = false;
  assert.deepEqual(reviewDesign(readOnly), []);
});

test("logging rules depend on the data classification", () => {
  assert.equal(minimumRetentionDays("restricted"), 365);
  assert.equal(minimumRetentionDays("internal"), 90);
  const spec = compliant();
  spec.audit.redactsPii = false;
  spec.audit.retentionDays = 180;
  assert.deepEqual(keys(reviewDesign(spec)), ["high pii-redaction logs", "medium audit retention"]);
  const kept = compliant();
  kept.audit.retentionDays = 4000;
  assert.deepEqual(keys(reviewDesign(kept)), ["medium audit retention-limit"]);
  assert.deepEqual(reviewDesign({ ...kept, audit: { ...kept.audit, maxRetentionDays: null } }), []);
  const internal = { ...spec, classification: "internal" as const };
  assert.deepEqual(reviewDesign(internal), []);
  const silent = compliant();
  silent.audit.logsPrompts = false;
  silent.audit.redactsPii = false;
  assert.deepEqual(keys(reviewDesign(silent)), ["medium audit prompts"]);
});

test("a design with many gaps is rejected, findings ordered by severity, control and subject", () => {
  const spec = compliant();
  spec.components.push({ id: "cache", kind: "api", region: "global" });
  spec.tools[1].requiresApproval = false;
  spec.injection.separatesInstructions = false;
  spec.cost = { maxTokensPerRequest: null, hardMonthlyCap: false };
  spec.retrieval = { enforcesAccessInBackend: false };
  const findings = reviewDesign(spec);
  assert.deepEqual(keys(findings), [
    "high access-control retrieval",
    "high data-residency cache",
    "high human-approval send-client-email",
    "high prompt-injection instructions",
    "medium cost-cap monthly",
    "medium cost-cap per-request",
  ]);
  assert.ok(findings.every(f => f.message.length > 0));
  assert.equal(verdict(findings), "reject");
});

test("only medium findings approve with conditions; public data skips the retrieval access check", () => {
  const spec = compliant();
  spec.cost.hardMonthlyCap = false;
  assert.equal(verdict(reviewDesign(spec)), "approve-with-conditions");
  const open = { ...compliant(), classification: "public" as const, retrieval: { enforcesAccessInBackend: false } };
  assert.deepEqual(reviewDesign(open), []);
  const noTrust = { ...compliant(), retrieval: null };
  noTrust.injection = { untrustedInputs: [], separatesInstructions: false, validatesToolArguments: false };
  assert.deepEqual(reviewDesign(noTrust), []);
});

test("retrieved documents are always untrusted, even when the spec forgets to list them", () => {
  const spec = compliant();
  spec.injection = { untrustedInputs: [], separatesInstructions: false, validatesToolArguments: false };
  assert.deepEqual(keys(reviewDesign(spec)), ["high prompt-injection instructions", "high prompt-injection tool-arguments"]);
  assert.match(reviewDesign(spec)[0].message, /retrieved-documents/);
});
