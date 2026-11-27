# 25 · Planning vs reactive agents: an explicit state machine

## Why it matters
Step 23 was **reactive**: the model picks one action at a time after each observation. That adapts well but is hard to predict, review or bound — you only learn what it will do by watching it.

A **plan-and-execute** agent asks the model for the whole plan up front, as data:

```json
[{ "id": "fx", "tool": "convert_currency", "args": { "amount": 50, "from": "USD", "to": "GBP" }, "dependsOn": [] },
 { "id": "submit", "tool": "submit_expense", "args": { "converted": { "$from": "fx" } }, "dependsOn": ["fx"] }]
```

Because the plan exists before any side effect, your code can **validate** it (known tools, size, dependencies, no cycles), show it to a human (step 26), and run it with a cheaper executor instead of a large model per step. The cost: plans are brittle when the world surprises them, so you need a **replan budget**.

Whichever style you choose, make the control flow an **explicit state machine** — `planning → executing → done | failed` — with a pure reducer `transition(state, event)`. Every change goes through one function, so illegal moves (executing a step while planning, completing a step twice, acting after `done`) throw instead of silently corrupting state, every run can be replayed from its event log, and the states map directly to UI, traces and durable workflow engines.

| | Reactive (ReAct) | Plan-and-execute |
|---|---|---|
| Adapts to observations | every step | only by replanning |
| Reviewable before acting | no | yes — the plan is data |
| Model calls | one per step | one per plan (+ replans) |
| Typical failure | loops, drift | stale or invalid plans |

## Interview question
> When would you choose plan-and-execute over a reactive tool loop for a finance workflow, and what would you still do reactively? How do you make either one resumable after a crash?

Think about: approvals on the whole plan, deterministic execution, partial failure, idempotent steps (step 24), persisting the event log, and hybrid designs (plan, then a reactive sub-agent per step).

## Your task
Implement in `index.ts` (types, `initialState` and `reference` are provided):

- `executionOrder(plan)` → step IDs in dependency order; when several are ready, take the one earliest in the plan; `null` if a cycle prevents completion.
- `validatePlan(plan, toolNames, maxSteps = 6)` → problems (empty list if sound):
  - empty plan → only `plan is empty`;
  - `plan has N steps; the limit is M`; `duplicate step id "<id>"`;
  - then for each step in order: `step "<id>" uses unknown tool "<tool>"`, each `step "<id>" depends on unknown step "<dep>"`, and each argument `{ "$from": X }` with X not in `dependsOn`: `step "<id>" uses the result of "<X>" without depending on it`;
  - if there were no duplicate IDs or unknown dependencies and `executionOrder` is `null`: `plan has a dependency cycle`.
- `transition(state, event, maxReplans)` — pure; never mutates `state`:
  - `planning` + `plan` → `executing` with empty `results` and the same `replans`;
  - `planning` + `plan-rejected` → `planning` with `replans + 1` and `feedback: problems` if `replans < maxReplans`, else `failed` with reason `invalid plan: <problems joined by "; ">`;
  - `executing` + `step-succeeded` → record the result; when every step has one → `done` with `results`;
  - `executing` + `step-failed` → message `step <id> failed: <error>`; replan with `feedback: [message]` within budget, else `failed` with that message as reason;
  - a step event for a step not in the plan or already completed → throw `unknown or completed step: <id>`;
  - anything else → throw `invalid transition: <event type> while <status>`.
- `runPlan(goal, { planner, execute, toolNames, maxReplans = 1, maxSteps = 6 })` → `{ state, events }`: in `planning`, call `planner(goal, state.feedback)` and emit `plan` or `plan-rejected` from `validatePlan`; in `executing`, run steps in `executionOrder`, replacing `$from` argument values with earlier results, emitting `step-succeeded` or `step-failed` (the error message) and stopping the pass as soon as the state leaves `executing`. Return when `done` or `failed`; every event goes through `transition` and into `events`.

## Going further
Keep completed results across replans so the new plan can reuse them (safe only if steps are idempotent), persist the event log to resume after a crash, and compare this hand-rolled machine with a durable workflow engine (Azure Durable Functions, Temporal) or a graph framework (LangGraph).
