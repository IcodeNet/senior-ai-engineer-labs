# 26 · Human-in-the-loop approval for high-impact tools

## Why it matters
Some actions must not depend on a model being right: refunds, payments, deleting records, emailing clients. Prompt rules ("always ask before refunding") are not a control — an injected document or a confused plan can bypass them. The control has to live **in code, between the agent and the tool**:

- **Classify tools by impact.** `read` runs freely; `irreversible` always needs approval; `write` needs it above a threshold (an amount, a record count). Unknown tools **fail closed**, and so does a threshold field the model left out or filled with text.
- **Thresholds are cumulative.** A £500 limit per call is defeated by five £120 claims. Count what the same *principal* already spent with the tool inside a window and compare the running total; in production also aggregate per target (claim, payee) and per day. Three details decide whether the total can be trusted:
  - **Nothing may lower it.** A model-supplied `-10000` must not buy credit for a later `9000`: non-positive, non-finite and fractional amounts fail closed (they need approval) and are never counted.
  - **Use integer minor units.** Summing pounds as floating-point numbers drifts (`0.1 + 0.2 !== 0.3`), so a split of exactly £500.00 can land a hair under the threshold. Amounts here are whole pence (`amountPence`).
  - **Reserve before you await.** Check-then-act across an `await` lets five concurrent £120 calls all see a total of £0. Count the amount in the same synchronous step as the check, and release it only if the call fails — that call's own reservation, never the whole ledger, or one failure would wipe out what the principal already spent. (In a multi-process service this needs an atomic database update or a lock, not an in-memory array.)
  Only auto-executed calls count towards the total: a call a human approved has been reviewed on its own merits, so this gate does not add it (a stricter policy could).
- **Suspend, do not block.** A high-impact call becomes a *pending request* the run can wait on (or persist and resume later), not a thread sleeping until someone clicks.
- **Bind the approval to the exact arguments.** Hash the tool and canonical arguments when the request is created. The human approves *that* refund of £120 for claim `clm-7`; if anything changes afterwards — the model "corrects" the amount, an attacker edits the payload — the hash no longer matches and execution is refused. Store a copy, so the caller cannot mutate what was approved.
- **Four-eyes on principals, not strings.** The person who requested — directly, or through an agent acting for them (`agent:alice`, or even `agent:agent:alice`, acts for `alice`) — cannot approve, and an agent cannot approve anything. Actor identities must come from authentication, never from the model or tool arguments.
- **Expiry and single use.** Approvals go stale; an approval is consumed by one execution (at-most-once: if the downstream call fails, raise a new request rather than replaying).
- **Audit outcomes, not intentions** — who asked, who decided, when, and what actually happened: record `executed` only after the call succeeded, and `execution-failed` when it threw.

This is the same separation of duties a finance system already enforces for people; the agent gets no exemption.

## Interview question
> A product manager wants the refunds agent to "just ask for confirmation in the chat" before refunding. Why is that not sufficient, and what would you build instead?

Think about: who confirms (the requester is not an independent approver), what exactly is confirmed, injection that rewrites arguments after confirmation, replay of an old confirmation, audit and regulatory evidence, and approval fatigue (thresholds, batching).

## Your task
Implement in `index.ts` (`argsHash`, `principalOf`, the types and the gate's `audit`, `request`, `record`, `find`, `alreadySpent` and `reserve` helpers are provided; `support.ts` has `stableStringify` from step 24). Like step 25 this step has many exact rules; read the list once before you start.

- `needsApproval(policy, args, alreadySpent = 0)` → `true` for an unknown tool (`policy` undefined) or `irreversible`; `false` for `read`; for `write`, `true` without a threshold, or when `args[field]` is not a positive safe integer (minor units), or when `args[field] + alreadySpent >= amount`.
- `ApprovalGate#invoke(tool, args, requestedBy)`:
  - pass `this.alreadySpent(policy, principalOf(requestedBy))` to `needsApproval`; no approval needed → call `const release = this.reserve(policy, principal, args)` **before** awaiting anything, then execute; if it throws, call `release()`, record `execution-failed` and rethrow; on success record `auto-executed` (actor `requestedBy`) and return `{ status: "executed", result }`;
  - otherwise store a request `apr-<n>` (`n` counts from 1) with a **copy** of `args`, `argsHash(tool, args)`, `createdAt = now()`, `expiresAt = createdAt + ttlMs` (default 15 minutes), `status: "pending"`; record `requested`; return `{ status: "pending", requestId }`.
- Expiry: whenever a `pending` or `approved` request is used at or after `expiresAt`, set it to `expired` and record `expired` with actor `system`.
- `decide(requestId, { approver, approve, reason? })` → unknown ID: throw `unknown request: <id>`; expired: throw `request expired`; not pending: throw `request is <status>`; approver starts with `agent:`: throw `agents cannot approve requests`; `principalOf(approver) === principalOf(requestedBy)`: throw `requester cannot approve their own request`. Otherwise set `approved` or `rejected`, `decidedBy`, `reason` if given, record the decision (actor = approver) and return a copy of the request.
- `executeApproved(requestId, args)` → unknown: throw as above; expired: throw `request expired`; `executed`: throw `request already executed`; any other non-approved status: throw `request is <status>`; hash mismatch: throw `arguments changed after approval`. Otherwise set the status to `executed` **before** the call (single use), execute the **stored** arguments, then record `executed` (actor = requester) and return the result; if the call throws, set `failed`, record `execution-failed` and rethrow.

## Going further
Persist requests so a run can resume after approval, notify approvers in Teams with the exact arguments and the agent's justification, add tiered thresholds (team lead vs finance), and evaluate approval latency and rejection rate — a high rejection rate is an agent-quality signal.
