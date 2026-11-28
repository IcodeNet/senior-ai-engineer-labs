import { test } from "vitest";
import assert from "node:assert/strict";
import { lintToolDefinition, parseToolCall, validateArgs, type JsonSchema, type ToolDefinition, type ValidationError } from "./index.ts";

const submitExpense: ToolDefinition = {
  name: "submit_expense",
  description: "Submit an expense claim for the signed-in employee. Amounts are in the claim currency.",
  inputSchema: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Claim amount", minimum: 0.01, maximum: 5000 },
      currency: { type: "string", description: "ISO 4217 code", enum: ["GBP", "EUR", "USD"] },
      category: { type: "string", description: "Expense category", enum: ["travel", "meals", "training"] },
      receiptIds: { type: "array", description: "Uploaded receipt IDs", items: { type: "string", pattern: "^rcpt-[0-9]+$" }, maxItems: 3 },
      nights: { type: "integer", description: "Hotel nights", minimum: 0 },
      urgent: { type: "boolean", description: "Request fast-track approval" },
      note: { type: "string", description: "Free-text note", minLength: 3, maxLength: 20 },
    },
    required: ["amount", "currency", "category"],
    additionalProperties: false,
  },
};

const sorted = (errors: ValidationError[]): string[] => errors.map((e) => `${e.path}: ${e.message}`).sort();

test("valid arguments produce no errors", () => {
  assert.deepEqual(validateArgs(submitExpense.inputSchema, { amount: 42.5, currency: "GBP", category: "meals" }), []);
  assert.deepEqual(
    validateArgs(submitExpense.inputSchema, { amount: 10, currency: "EUR", category: "travel", receiptIds: ["rcpt-1"], nights: 2, urgent: false, note: "Lyon" }),
    [],
  );
});

test("missing, mistyped and unexpected properties are reported with JSON paths", () => {
  const errors = validateArgs(submitExpense.inputSchema, { amount: "42", category: "meals", approve: true });
  assert.deepEqual(sorted(errors), ["$.amount: expected number", "$.approve: unexpected property", "$.currency: required"]);
  assert.deepEqual(sorted(validateArgs(submitExpense.inputSchema, null)), ["$: expected object"]);
  assert.deepEqual(sorted(validateArgs(submitExpense.inputSchema, [1])), ["$: expected object"]);
});

test("keyword constraints: enum, range, integer, length, pattern and array size", () => {
  const errors = validateArgs(submitExpense.inputSchema, {
    amount: 0,
    currency: "JPY",
    category: "travel",
    receiptIds: ["rcpt-1", "receipt-2", "rcpt-3", "rcpt-4"],
    nights: 1.5,
    urgent: "yes",
    note: "ok",
  });
  assert.deepEqual(sorted(errors), [
    "$.amount: must be >= 0.01",
    "$.currency: must be one of: GBP, EUR, USD",
    "$.nights: expected integer",
    "$.note: must be at least 3 characters",
    "$.receiptIds: must have at most 3 items",
    "$.receiptIds[1]: must match pattern ^rcpt-[0-9]+$",
    "$.urgent: expected boolean",
  ]);
  assert.deepEqual(sorted(validateArgs(submitExpense.inputSchema, { amount: 9000, currency: "GBP", category: "meals", note: "x".repeat(21) })), [
    "$.amount: must be <= 5000",
    "$.note: must be at most 20 characters",
  ]);
  assert.deepEqual(sorted(validateArgs({ type: "number" }, Number.NaN)), ["$: expected number"]);
});

test("inherited and prototype-polluting keys cannot bypass the schema", () => {
  const smuggled = JSON.parse('{"amount":5,"currency":"GBP","category":"meals","constructor":true,"toString":"x","__proto__":{"approve":true}}');
  assert.deepEqual(sorted(validateArgs(submitExpense.inputSchema, smuggled)), [
    "$.__proto__: reserved property name",
    "$.constructor: reserved property name",
    "$.toString: unexpected property",
  ]);
  const open = { type: "object" as const, properties: {}, additionalProperties: true };
  assert.deepEqual(sorted(validateArgs(open, JSON.parse('{"__proto__":{"isAdmin":true}}'))), ["$.__proto__: reserved property name"], "reserved even when extra keys are allowed");
  const needsToString = { type: "object" as const, properties: { toString: { type: "string" as const, description: "x" } }, required: ["toString"] };
  assert.deepEqual(sorted(validateArgs(needsToString, {})), ["$.toString: required"], "an inherited key is not a present key");
  const parsed = parseToolCall([submitExpense], { name: "submit_expense", arguments: '{"amount":5,"currency":"GBP","category":"meals","__proto__":{"approve":true}}' });
  assert.equal(parsed.ok, false);
});

test("a valid call is parsed into a name and an arguments object", () => {
  assert.deepEqual(parseToolCall([submitExpense], { name: "submit_expense", arguments: '{"amount":12,"currency":"GBP","category":"meals"}' }), {
    ok: true,
    name: "submit_expense",
    args: { amount: 12, currency: "GBP", category: "meals" },
  });
});

test("unknown tools, broken JSON and invalid arguments become errors the model can act on", () => {
  const unknown = parseToolCall([submitExpense], { name: "transfer_funds", arguments: "{}" });
  assert.equal(unknown.ok, false);
  if (unknown.ok) return;
  assert.equal(unknown.error, "unknown-tool");
  assert.equal(unknown.message, 'Unknown tool "transfer_funds". Available tools: submit_expense');

  const broken = parseToolCall([submitExpense], { name: "submit_expense", arguments: '{"amount": 12,' });
  assert.deepEqual(broken, { ok: false, error: "invalid-json", message: "Arguments are not valid JSON", details: [] });

  const invalid = parseToolCall([submitExpense], { name: "submit_expense", arguments: '{"amount":-1,"currency":"GBP","category":"meals"}' });
  assert.equal(invalid.ok, false);
  if (invalid.ok) return;
  assert.equal(invalid.error, "invalid-arguments");
  assert.deepEqual(invalid.details, [{ path: "$.amount", message: "must be >= 0.01" }]);
  assert.equal(invalid.message, "Invalid arguments: $.amount: must be >= 0.01");

  const notObject = parseToolCall([submitExpense], { name: "submit_expense", arguments: "[]" });
  assert.equal(notObject.ok, false);
  if (!notObject.ok) assert.equal(notObject.error, "invalid-arguments");
});

test("a well-described tool passes the lint", () => {
  assert.deepEqual(lintToolDefinition(submitExpense), []);
});

test("the lint flags names, descriptions and schemas that confuse a model", () => {
  const sloppyProperties: Record<string, JsonSchema> = { amount: { type: "number" } };
  sloppyProperties["constructor"] = { type: "string", description: "x" };
  const sloppy: ToolDefinition = {
    name: "submit expense!",
    description: "Submit.",
    inputSchema: { type: "object", properties: sloppyProperties, required: ["amount", "currency", "toString"] },
  };
  assert.deepEqual(lintToolDefinition(sloppy), [
    "name must match ^[a-zA-Z0-9_-]{1,64}$",
    "description is too short to guide the model",
    'required property "currency" is not defined',
    'required property "toString" is not defined',
    'property "amount" has no description',
    'property "constructor" uses a reserved name',
    "inputSchema should set additionalProperties: false",
  ]);
});
