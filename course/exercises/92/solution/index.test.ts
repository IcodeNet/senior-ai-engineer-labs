import { test } from "vitest";
import assert from "node:assert/strict";
import { applyMitigations, prioritise, rpn, type FailureMode } from "./index.ts";

// Synthetic failure modes for a RAG assistant; ratings are illustrative.
const modes: FailureMode[] = [
  { id: "injection", stage: "retrieval", description: "Instructions hidden in a retrieved document are followed", severity: 9, occurrence: 4, detection: 6 },
  { id: "stale-index", stage: "indexing", description: "Superseded policy is still retrievable", severity: 5, occurrence: 5, detection: 4 },
  { id: "fabricated-citation", stage: "generation", description: "Answer cites a source that does not support it", severity: 7, occurrence: 3, detection: 5 },
  { id: "pii-in-logs", stage: "observability", description: "Client personal data stored in prompt logs", severity: 10, occurrence: 2, detection: 3 },
  { id: "rate-limited", stage: "generation", description: "Model endpoint returns 429 at peak", severity: 4, occurrence: 6, detection: 2 },
  { id: "embedding-drift", stage: "retrieval", description: "New embedding model silently lowers recall", severity: 6, occurrence: 3, detection: 8 },
];

test("risk priority number multiplies severity, occurrence and detection", () => {
  assert.equal(rpn(modes[0]), 216);
  assert.equal(rpn(modes[3]), 60);
  assert.throws(() => rpn({ ...modes[0], severity: 11 }), RangeError);
  assert.throws(() => rpn({ ...modes[0], detection: 0 }), RangeError);
  assert.throws(() => rpn({ ...modes[0], occurrence: 2.5 }), RangeError);
});

test("prioritisation ranks by RPN and never lets a severe failure hide behind a low RPN", () => {
  assert.deepEqual(prioritise(modes), [
    { id: "injection", rpn: 216, severity: 9, actionRequired: true, trigger: "both" },
    { id: "embedding-drift", rpn: 144, severity: 6, actionRequired: true, trigger: "rpn" },
    { id: "fabricated-citation", rpn: 105, severity: 7, actionRequired: true, trigger: "rpn" },
    { id: "stale-index", rpn: 100, severity: 5, actionRequired: true, trigger: "rpn" },
    { id: "pii-in-logs", rpn: 60, severity: 10, actionRequired: true, trigger: "severity" },
    { id: "rate-limited", rpn: 48, severity: 4, actionRequired: false, trigger: "none" },
  ]);
});

test("equal RPNs are ordered by severity, then id; thresholds are configurable", () => {
  const tied: FailureMode[] = [
    { id: "b", stage: "s", description: "", severity: 4, occurrence: 5, detection: 5 },
    { id: "a", stage: "s", description: "", severity: 4, occurrence: 5, detection: 5 },
    { id: "c", stage: "s", description: "", severity: 10, occurrence: 2, detection: 5 },
  ];
  assert.deepEqual(prioritise(tied).map(p => p.id), ["c", "a", "b"]);
  assert.deepEqual(prioritise(tied, { rpnThreshold: 200, severityThreshold: 11 }).map(p => p.trigger), ["none", "none", "none"]);
});

test("mitigations lower occurrence or detection and the residual risk is recomputed", () => {
  const result = applyMitigations(modes, [
    { modeId: "injection", control: "injection canary tests and classifier", detection: 2 },
    { modeId: "injection", control: "instruction/data separation", occurrence: 3 },
    { modeId: "embedding-drift", control: "recall regression gate on model change", detection: 3 },
  ]);
  assert.equal(result.before, 673);
  assert.equal(result.after, 421);
  const injection = result.modes.find(m => m.id === "injection");
  assert.deepEqual([injection?.severity, injection?.occurrence, injection?.detection], [9, 3, 2]);
  assert.equal(modes[0].detection, 6, "input is not mutated");
  assert.equal(prioritise(result.modes).find(p => p.id === "injection")?.trigger, "severity");
});

test("a mitigation cannot raise a rating or target an unknown mode", () => {
  assert.throws(() => applyMitigations(modes, [{ modeId: "injection", control: "oops", detection: 7 }]), RangeError);
  assert.throws(() => applyMitigations(modes, [{ modeId: "nope", control: "x", detection: 1 }]), { message: "unknown failure mode nope" });
});
