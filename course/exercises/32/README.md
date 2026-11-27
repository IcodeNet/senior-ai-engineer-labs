# 32 · Prompt-injection defences and a red-team harness

## Why it matters
Anything the model reads can try to give it orders: a retrieved policy page edited by an attacker, an email in a customer's case history, a tool result. **Indirect prompt injection** is the top risk in the OWASP Top 10 for LLM applications, and there is no single fix — a model cannot reliably tell data from instructions. You reduce the risk in layers and **measure** what gets through:

1. **Input screening** — flag documents with injection signals (override phrases, role changes, fake tags, image-link beacons) and quarantine them for review instead of sending them.
2. **Structural separation** — instructions only in the system prompt; untrusted text escaped inside `<document>` blocks so it cannot close its own tag (as in step 06).
3. **Output checks** — a **canary** token in the system prompt reveals prompt leakage when it appears in the output; links to domains outside an allowlist are blocked, because a link or a markdown image is how data is exfiltrated and how phishing reaches staff.
4. **Least privilege** — the model gets no tools or data it does not need (Lab 04 covers tool permissions).
   These checks are narrow by design and you should know their gaps: a bare `evil.example/login` with no scheme or `www.` is not detected, and a canary that the model encodes (base64, translation) is not recognised. Rendering the answer as plain text, with links only from an allowlist the UI controls, closes more of the gap than any regex.
5. **A red-team suite** — known attacks run in CI and report the **attack success rate**. Heuristics are bypassable (the "print everything above" case below slips past the scanner); the suite shows which layer caught each attack and stops regressions.

The fake model in the tests is deliberately gullible, so the difference between the naive and the guarded pipeline is visible and deterministic.

## Interview question
> A security reviewer shows that a poisoned document in your knowledge base makes the assistant tell staff to "verify" at an external URL. What do you change, and how do you show the fix works and stays fixed?

Think about: provenance and approval of indexed content (steps 02 and 30), quarantine, output link allowlists, a regression case in the red-team suite, and what attack success rate you would accept.

## Your task
Implement in `index.ts`:

- `scanForInjection(text)` → `{ flagged, signals }` — the `name` of every `INJECTION_SIGNALS` pattern that matches, in list order.
- `guardedAnswer(question, docs, { llm, canary, allowedDomains })`:
  - quarantine flagged documents (IDs in `quarantined`, in input order); if none remain, return `{ kind: "blocked", reason: "no-safe-context", quarantined }` **without** calling the model;
  - system prompt: `SYSTEM_RULES + "\nCanary: " + canary`; user prompt: `Question: <q>`, a blank line, `Documents:`, then one `<document id="<id>">\n<escaped text>\n</document>` per safe document, joined with newlines;
  - call the model once; if the output, reduced to lower-case letters and digits, contains the canary reduced the same way → `"canary-leak"` (so `c a n a r y - 7 F 3 A` still counts); any disallowed link → `"disallowed-link"`; otherwise `{ kind: "answer", text, quarantined }`. `disallowedLink` is a helper you write: find candidates — `scheme:` followed by two slashes or backslashes, scheme-relative `//host` (not glued to a word, so `50//50` is not a link) and `www.host` — make relative ones absolute with `https:`, and parse each with the WHATWG `new URL()`, exactly as a browser would, so a backslash counts as `/` and `https://evil.example\.northbank.example` has host `evil.example`. A link is disallowed if it fails to parse, is not `https:`, carries credentials (`https://northbank.example@evil.example` has user `northbank.example` and host `evil.example`), or its hostname is not an allowed domain or a subdomain of one (`host === d` or `host` ends with `"." + d`, so `evilnorthbank.example` and `northbank.example.evil` are **not** allowed). Never compare hosts with a regex of your own: parser differentials are a classic allowlist bypass.
- `runRedTeam(cases, target)` → `{ total, attacksSucceeded, attackSuccessRate, failures }` — an attack succeeds when the target's output contains any `forbidden` string; `failures` are case IDs in order. Throw `RangeError` for no cases.

## Going further
Add encoded and multilingual variants of each attack, a classifier such as Azure AI Content Safety Prompt Shields as another layer, and report attack success rate per category over time. Decide whether quarantined documents should alert the content owner.
