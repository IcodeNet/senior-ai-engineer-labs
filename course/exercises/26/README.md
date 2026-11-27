# 26 · Human-in-the-loop approval for high-impact tools

## Why it matters
Some actions must not depend on a model being right: refunds, payments, deleting records, emailing clients. Prompt rules ("always ask before refunding") are not a control — an injected document or a confused plan can bypass them. The control has to live **in code, between the agent and the tool**:

- **Classify tools by impact.** `read` runs freely; `irreversible` always needs approval; `write` needs it above a threshold (an amount, a record count). Unknown tools **fail closed**, and so does a threshold field the model left out or filled with text.
- **Suspend, do not block.** A high-impact call becomes a *pending request* the run can wait on (or persist and resume later), not a thread sleeping until someone clicks.
- **Bind the approval to the exact arguments.** Hash the tool and canonical arguments when the request is created. The human approves *that* refund of £120 for claim `clm-7`; if anything changes afterwards — the model "corrects" the amount, an attacker edits the payload — the hash no longer matches and execution is refused. Store a copy, so the caller cannot mutate what was approved.
- **Four-eyes.** The person (or agent acting for them) who requested cannot approve.
- **Expiry and single use.** Approvals go stale; an approval is consumed by one execution (at-most-once: if the downstream call fails, raise a new request rather than replaying).
- **Audit everything** — who asked, who decided, when, and what ran.

This is the same separation of duties a finance system already enforces for people; the agent gets no exemption.

## Interview question
> A product manager wants the refunds agent to "just ask for confirmation in the chat" before refunding. Why is that not sufficient, and what would you build instead?

Think about: who confirms (the requester is not an independent approver), what exactly is confirmed, injection that rewrites arguments after confirmation, replay of an old confirmation, audit and regulatory evidence, and approval fatigue (thresholds, batching).

## Your task
Implement in `index.ts` (`argsHash`, the types and the gate's `audit`, `request`, `record` and `find` helpers are provided; `support.ts` has `stableStringify` from step 24):

- `needsApproval(policy, args)` → `true` for an unknown tool (`policy` undefined) or `irreversible`; `false` for `read`; for `write`, `true` without a threshold, or when `args[field]` is not a finite number, or is `>= amount`.
- `ApprovalGate#invoke(tool, args, requestedBy)`:
  - no approval needed → execute, record `auto-executed` (actor `requestedBy`), return `{ status: "executed", result }`;
  - otherwise store a request `apr-<n>` (`n` counts from 1) with a **copy** of `args`, `argsHash(tool, args)`, `createdAt = now()`, `expiresAt = createdAt + ttlMs` (default 15 minutes), `status: "pending"`; record `requested`; return `{ status: "pending", requestId }`.
- Expiry: whenever a `pending` or `approved` request is used at or after `expiresAt`, set it to `expired` and record `expired` with actor `system`.
- `decide(requestId, { approver, approve, reason? })` → unknown ID: throw `unknown request: <id>`; expired: throw `request expired`; not pending: throw `request is <status>`; approver is the requester: throw `requester cannot approve their own request`. Otherwise set `approved` or `rejected`, `decidedBy`, `reason` if given, record the decision (actor = approver) and return a copy of the request.
- `executeApproved(requestId, args)` → unknown: throw as above; `executed`: throw `request already executed`; any other non-approved status: throw `request is <status>`; hash mismatch: throw `arguments changed after approval`. Otherwise mark `executed`, record `executed` (actor = requester) and return the result of executing the **stored** arguments.

## Going further
Persist requests so a run can resume after approval, notify approvers in Teams with the exact arguments and the agent's justification, add tiered thresholds (team lead vs finance), and evaluate approval latency and rejection rate — a high rejection rate is an agent-quality signal.
