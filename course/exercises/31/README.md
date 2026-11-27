# 31 · PII detection and redaction

## Why it matters
Support agents paste customer emails, card numbers and account details into the assistant. Each copy that leaves your boundary — to a model provider, a prompt log, a trace, an evaluation dataset, a cache — is a new place personal data must be governed, retained and deleted under GDPR and PCI DSS. The cheapest control is to **not send it**: detect PII before the prompt is built and before anything is logged.

Detection is a precision/recall trade-off:

- **Patterns** find candidates (`\d{13,19}` matches card numbers — and order IDs).
- **Checksums** cut false positives: card numbers pass the **Luhn** check; IBANs pass **ISO 13616 mod-97**. A reference number that fails the checksum is left alone.
- **Windows, not greedy matches**: a greedy `\d{13,19}` swallows "12 4111 1111 1111 1111" as one 18-digit number that fails Luhn, and the real card leaks. Trying every digit-group-aligned window of 13–19 digits finds it.
- **Overlaps** are resolved so one value is not redacted twice (a Luhn-valid number that is also an email's local part is one email).

Redaction uses **typed, reversible placeholders** — `[EMAIL_1]`, `[CARD_1]` — so the model can still reason ("refund to [IBAN_1]") and your backend can **restore** the values in the final answer for the authorised user. The placeholder → value mapping stays server-side, in memory for the request; it must never be logged or sent to the model.

Regex detectors miss names, addresses and free-text identifiers; production systems add an NER service (for example Azure AI Language PII detection) on top. Card windows start and end at digit-group boundaries, so a card with other digits glued on without a separator (`124111111111111111`) is still missed. The National Insurance pattern accepts prefixes HMRC never issues, and text that already contains something like `[EMAIL_1]` would collide with generated placeholders (a per-request nonce in the placeholder, such as `[EMAIL_1_x7f]`, avoids that). All values in this step are synthetic or public test values: `QQ` is HMRC's example NI prefix.

## Interview question
> Legal asks you to guarantee that no customer PII reaches the model provider or your logs. What do you build, what can you honestly promise, and how do you measure it?

Think about: detection recall on a labelled set, checksums vs. false positives, logs and traces as leak paths, data residency, and why "guarantee" needs careful wording.

## Your task
Implement in `index.ts` (the regexes in `PATTERNS` and the card window generator `cardCandidates` are given):

- `luhnValid(value)` — remove spaces and dashes; require 13–19 digits; from the rightmost digit, double every second digit (subtract 9 if > 9); valid when the sum is divisible by 10.
- `ibanValid(value)` — remove spaces, upper-case; require `^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$`; move the first four characters to the end, replace letters with numbers (A = 10 … Z = 35) and check the number mod 97 equals 1 (compute the remainder digit by digit to avoid overflow).
- `detectPii(text)` — every pattern match that passes its `valid` check, plus every `cardCandidates(text)` window that passes `luhnValid` (type `"card"`), as `{ type, start, end, value }`; sort by `start`, longer spans first on ties, and drop any span that starts before the previous kept span ends.
- `redact(text)` → `{ text, mapping, counts }` — placeholders `[TYPE_n]` numbered per type in order of first appearance; a repeated value reuses its placeholder; `counts` is the number of **distinct** values per type.
- `restore(text, mapping)` — replace placeholders found in `mapping`; leave unknown ones untouched.

## Going further
Measure detector precision and recall on a labelled set of synthetic support tickets, add names via an NER model, and decide what to do with PII the model *generates* (scan the output too). Consider format-preserving tokenisation when downstream systems need valid-looking values.
