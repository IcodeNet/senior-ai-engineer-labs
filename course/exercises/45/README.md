# 45 · System-design review: find the missing controls

## Why it matters
The last question in a senior AI design interview — and the first in a real architecture review board — is "what is missing?". Reviewers check the same controls every time, so a structured design spec can be checked mechanically before people spend time on the interesting trade-offs:

- **Data residency**: every component (model, vector store, logs, caches) must run in the required geography; a "global" cache is a residency breach too. Region names come in many spellings (`swedencentral`, `West Europe`, `eu`), so compare normalised geographies, not raw strings — the provided `regionGeography` does this for a few Azure regions; a real review uses the full region list.
- **Human approval** for tools that write or move money; read-only tools can run unattended.
- **Audit**: side-effecting tool calls and prompts are logged, and retention meets the policy for the data classification. Retention has a floor *and* a ceiling: record-keeping rules set minimums, while data-protection storage limitation (for example GDPR) means personal data must not be kept longer than needed. The 365/90-day minimums and the policy maximum here are course placeholders; real values come from your records policy and regulator.
- **PII redaction** before confidential prompts reach logs.
- **Prompt injection**: untrusted input (retrieved documents, emails, web pages) is separated from instructions, and model-proposed tool arguments are validated before any side effect. A design with retrieval always has untrusted input — retrieved documents — whether or not the spec lists it.
- **Cost caps**: a per-request token limit and an *enforced* monthly cap — Azure budget alerts notify, they do not stop spending.
- **Access control** enforced in the retrieval backend, never delegated to the model.

Every finding carries a control, severity, subject and message, sorted so the most serious appear first. Any high finding rejects the design; only medium findings approve it with conditions.

## Interview question
> Here is a design for an assistant that reads client emails, searches internal policy documents and can send replies and book meetings on the adviser's behalf. Review it: what controls would you require before it goes live?

## Model answer outline
- Classify the data first (client emails are confidential) — it sets residency, retention, redaction and access requirements.
- Trust boundaries: emails and retrieved documents are untrusted; separate them from instructions, validate tool arguments against schemas and allow-lists, and require approval for sending email or booking on someone's behalf.
- Residency and processing: every component in-region, including logs, caches and evaluation pipelines; check model provider data-processing terms.
- Auditability: log prompts (redacted), retrieved sources, tool calls, approvals and model/version; retention per policy; tamper-evident storage.
- Cost and abuse: per-request token limits, per-user rate limits, an enforced spend cap at the gateway, alerts as a second line.
- Close with residual risks and an FMEA (step 43), plus SLOs (step 42) and evaluation gates (step 15) for launch.

## Your task
Implement in `index.ts`:

- `minimumRetentionDays(classification)` — 365 for `confidential` and `restricted`, otherwise 90.
- `reviewDesign(spec)` → `Finding[]` with these rules (side-effecting tools are `write` and `payment`):
  - `data-residency` (high, subject = component id) for each component whose `regionGeography(region)` differs from `regionGeography(dataResidency)` when `dataResidency` is not null (`regionGeography` is provided);
  - `human-approval` (high, subject = tool id) for each side-effecting tool without `requiresApproval`;
  - `audit` (high, `tool-calls`) when side-effecting tools exist and tool calls are not logged; (medium, `prompts`) when prompts are not logged; (medium, `retention`) when `retentionDays` is below the minimum; (medium, `retention-limit`) when `maxRetentionDays` is not null and `retentionDays` exceeds it;
  - `pii-redaction` (high, `logs`) when prompts are logged without redaction for confidential or restricted data;
  - `prompt-injection`: the effective untrusted inputs are `untrustedInputs` plus `"retrieved-documents"` whenever `retrieval` is not null (once). When there are any: (high, `instructions`) without instruction separation, with a message naming the inputs; (high, `tool-arguments`) when side-effecting tools exist without argument validation;
  - `cost-cap` (medium, `per-request`) when `maxTokensPerRequest` is null; (medium, `monthly`) without a hard monthly cap;
  - `access-control` (high, `retrieval`) when there is retrieval, the data is not public and access is not enforced in the backend.
  - Every finding has a non-empty `message`. Sort high before medium, then by control, then by subject.
- `verdict(findings)` → `"reject"` with any high finding, `"approve-with-conditions"` with only medium findings, `"approve"` with none.

## Going further
Add rules for model/version pinning, a kill switch, rate limits per user and evaluation gates before release; then load the spec from a YAML file checked into each service repository and run the review in CI.
