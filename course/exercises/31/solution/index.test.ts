import { test } from "vitest";
import assert from "node:assert/strict";
import { detectPii, ibanValid, luhnValid, redact, restore } from "./index.ts";

// Synthetic values only: 4111... and 5555... are public test cards, GB82 WEST... is the textbook example IBAN
// and QQ is HMRC's example National Insurance prefix.
const message =
  "Customer jane.doe@example.com disputes a charge on card 4111 1111 1111 1111. " +
  "Refund to GB82 WEST 1234 5698 7654 32, NI number QQ 12 34 56 C. Reference 4111 1111 1111 1112.";

test("checksums separate real identifiers from look-alike numbers", () => {
  assert.equal(luhnValid("4111 1111 1111 1111"), true);
  assert.equal(luhnValid("4111-1111-1111-1112"), false);
  assert.equal(luhnValid("1234"), false);
  assert.equal(luhnValid("5555 5555 5555 4444"), true, "doubling 5 gives 10, which counts as 1");
  assert.equal(luhnValid("5555 5555 5555 4440"), false);
  assert.equal(ibanValid("GB82 WEST 1234 5698 7654 32"), true);
  assert.equal(ibanValid("GB00 WEST 1234 5698 7654 32"), false);
});

test("detectPii finds each type with offsets, skipping invalid card numbers", () => {
  const spans = detectPii(message);
  assert.deepEqual(
    spans.map((s) => [s.type, s.value]),
    [
      ["email", "jane.doe@example.com"],
      ["card", "4111 1111 1111 1111"],
      ["iban", "GB82 WEST 1234 5698 7654 32"],
      ["nino", "QQ 12 34 56 C"],
    ],
  );
  for (const span of spans) assert.equal(message.slice(span.start, span.end), span.value);
});

test("overlapping matches keep the earliest, longest span", () => {
  // The local part is a Luhn-valid card number, so both an email and a card match the same characters.
  assert.deepEqual(detectPii("Write to 4111111111111111@cards.example now"), [
    { type: "email", start: 9, end: 39, value: "4111111111111111@cards.example" },
  ]);
  assert.deepEqual(detectPii("Pay GB82 WEST 1234 5698 7654 32 today").map((s) => s.type), ["iban"]);
});

test("a card next to other digits is still found", () => {
  assert.deepEqual(detectPii("Ref 12 4111 1111 1111 1111"), [{ type: "card", start: 7, end: 26, value: "4111 1111 1111 1111" }]);
  assert.deepEqual(detectPii("Batch 2026-11-27 card 5555-5555-5555-4444.").map((s) => s.value), ["5555-5555-5555-4444"]);
});

test("redact replaces values with typed placeholders, reusing one per repeated value", () => {
  const result = redact("From a@example.com to b@example.com, cc a@example.com; card 4111111111111111.");
  assert.equal(result.text, "From [EMAIL_1] to [EMAIL_2], cc [EMAIL_1]; card [CARD_1].");
  assert.deepEqual(result.mapping, { "[EMAIL_1]": "a@example.com", "[EMAIL_2]": "b@example.com", "[CARD_1]": "4111111111111111" });
  assert.deepEqual(result.counts, { email: 2, card: 1, iban: 0, nino: 0 });
});

test("the redacted prompt contains no original values, and restore rehydrates the answer", () => {
  const { text, mapping } = redact(message);
  for (const value of Object.values(mapping)) assert.equal(text.includes(value), false);
  const modelAnswer = "We will refund [IBAN_1] and email [EMAIL_1]; [UNKNOWN_1] stays as is.";
  assert.equal(
    restore(modelAnswer, mapping),
    "We will refund GB82 WEST 1234 5698 7654 32 and email jane.doe@example.com; [UNKNOWN_1] stays as is.",
  );
});

test("text without PII passes through unchanged", () => {
  assert.deepEqual(redact("What is the travel policy?"), {
    text: "What is the travel policy?",
    mapping: {},
    counts: { email: 0, card: 0, iban: 0, nino: 0 },
  });
});
