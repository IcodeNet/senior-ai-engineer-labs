# 25 · Planning vs reactive agents: an explicit state machine

## Why it matters
Step 23 was **reactive**: the model picks one action at a time after each observation. That adapts well but is hard to predict, review or bound — you only learn what it will do by watching it.

A **plan-and-execute** agent asks the model for the whole plan up front, as data:

```json
[{ "id": "fx", "tool": "convert_currency", "args": { "amount": 50, "from": "USD", "to": "GBP" }, "dependsOn": [] },
 { "id": "submit", "tool": "submit_expense", "args": { "converted": { "$from": "fx" } }, "dependsOn": ["fx"] }]
```

Because the plan exists before any side effect, your code can **validate** it (known tools, size, dependencies, no cycles), show it to a human (step 26), and run it with a cheaper executor instead of a large model per step. The cost: plans are brittle when the world surprises them, so you need a **replan budget**.

**Replanning must not repeat side effects.** If `notify_manager` fails after `submit_expense` succeeded, a naive replan runs the whole new plan again and submits the expense twice. Keep a record of completed steps (tool, resolved arguments, result) across replans and reuse a result when the new plan contains the *same* step — same ID, tool and **resolved** inputs. Comparing the raw `{ "$from": "fx" }` is not enough: if `fx` re-ran with a new amount, `submit` must run again with the new conversion. A step whose arguments changed is a new action and runs again, so side-effecting tools still need step 24's idempotency keys as the last line of defence.

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
Implement in `index.ts` (types, `initialState`, `reference` and `resolveArgs` are provided). This is the longest step in the lab: `transition` is the core; treat `runPlan` as the stretch goal if you are short of time.

- `executionOrder(plan)` → step IDs in dependency order; when several are ready, take the one earliest in the plan; `null` if a cycle prevents completion.
- `validatePlan(plan, toolNames, maxSteps = 6)` → problems (empty list if sound):
  - empty plan → only `plan is empty`;
  - `plan has N steps; the limit is M`; `duplicate step id "<id>"`;
  - then for each step in order: `step "<id>" uses unknown tool "<tool>"`, each `step "<id>" depends on unknown step "<dep>"`, and each argument `{ "$from": X }` with X not in `dependsOn`: `step "<id>" uses the result of "<X>" without depending on it`;
  - if there were no duplicate IDs or unknown dependencies and `executionOrder` is `null`: `plan has a dependency cycle`.
- `transition(state, event, maxReplans)` — pure; never mutates `state`:
  - `planning` + `plan` → `executing` with the same `replans` and `completed`, and `results` pre-filled from `completed`: walk the plan in `executionOrder` (plan order if it has a cycle; a plan may list a dependant before its upstream step, and walking in plan order would then re-run the dependant and repeat its side effect) and reuse a step when `completed` has its ID with the same tool, **every** `dependsOn` step — not just some of them, and not just the ones passed in through `$from` — is already an own key of `results` (check with `Object.hasOwn`: `"toString" in results` is true for every object, and checking by value fails because a step may legitimately return `undefined`, which resolves exactly like a missing result), and `isDeepStrictEqual(completed.args, resolveArgs(step, results so far))`; if that already covers every step → `done`;
  - `planning` + `plan-rejected` → `planning` with `replans + 1`, `feedback: problems` and the same `completed` if `replans < maxReplans`, else `failed` with reason `invalid plan: <problems joined by "; ">`;
  - `executing` + `step-succeeded` → record the result in `results` and `{ tool, args: resolveArgs(step, results before this step), result }` in `completed`; when every step has a result → `done` with `results`;
  - `executing` + `step-failed` → message `step <id> failed: <error>`; replan with `feedback: [message]` and the current `completed` within budget, else `failed` with that message as reason;
  - a step event for a step not in the plan or already in `results` → throw `unknown or completed step: <id>` (check keys with `Object.hasOwn`);
  - anything else → throw `invalid transition: <event type> while <status>`.
- `runPlan(goal, { planner, execute, toolNames, maxReplans = 1, maxSteps = 6 })` → `{ state, events }`: in `planning`, call `planner(goal, state.feedback)` and emit `plan` or `plan-rejected` from `validatePlan`; in `executing`, run steps in `executionOrder`, skipping steps that already have a result, replacing `$from` argument values with earlier results, emitting `step-succeeded` or `step-failed` (the error message) and stopping the pass as soon as the state leaves `executing`. Arguments are resolved with the provided `resolveArgs(step, results)`, and `completed` stores the **resolved** arguments, so a step is reused only when it would run with identical inputs — if an upstream step re-ran, its dependants' inputs change and they run again. If a pass over the plan emits no event, throw `runPlan made no progress` (a bug would otherwise spin forever). Return when `done` or `failed`; every event goes through `transition` and into `events`.

## Going further
Persist the event log to resume after a crash, and compare this hand-rolled machine with a durable workflow engine (Azure Durable Functions, Temporal) or a graph framework (LangGraph).
