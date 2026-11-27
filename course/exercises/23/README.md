# 23 · The tool-calling loop with step limits

## Why it matters
An "agent" is mostly a loop you own:

```
messages = [system, user]
repeat:
  turn = model(messages, toolDefinitions)
  if turn is a final answer: stop
  for each tool call: validate → run → append a tool message with the call's ID
```

This is the reactive (ReAct-style) agent: the model decides the next action after seeing each observation. The loop is where reliability lives:

- **Every call gets a result.** Unknown tools, invalid arguments and exceptions become `isError` tool messages, so the model can recover — and the tool never runs on arguments that failed validation (step 22).
- **Budgets are mandatory.** Without a step limit and a tool-call budget, a confused model loops until your bill or timeout stops it. A step is one model call; stop *before* making a call you cannot afford.
- **Loop detection.** Repeating the identical call is the commonest failure mode. Here an exact repeat stops the run; production agents may allow polling tools to repeat.
- **The model sees definitions, not implementations.** Pass name, description and schema only.
- **Model failures propagate.** A provider error is not a tool error: let the caller retry or fail the request (step 24).

`support.ts` contains the step 22 validation. The model is a scripted fake, so the tests are deterministic and free.

## Interview question
> Your agent passes every demo but in production 3% of runs hit the step limit and cost ten times the median. How do you find out why, and what do you change?

Think about: tracing every turn and tool result, clustering stuck trajectories, repeated calls, tool errors the model cannot act on, ambiguous tool descriptions, and whether the limit should return a partial answer or escalate to a human.

## Your task
Implement `runAgent(input, { model, tools, system, maxSteps = 8, maxToolCalls = 20 })` in `index.ts`:

- start the transcript with `{ role: "system", content: system }` and `{ role: "user", content: input }`;
- each step calls `model({ messages, tools })` once, with a **copy** of the transcript and tool definitions containing only `name`, `description` and `inputSchema`;
- a `final` turn → append `{ role: "assistant", content: text }` and stop with `stopReason: "final"` and `text`;
- a `tool_calls` turn → append `{ role: "assistant", content: text ?? "", toolCalls: calls }`, then for each call in order:
  - if an identical call (same name and same `arguments` string) already ran in this run → stop with `"repeated-call"`;
  - if `maxToolCalls` calls already ran → stop with `"max-tool-calls"`;
  - otherwise count it and append `{ role: "tool", toolCallId, name, content, isError }`: the `parseToolCall` message for an invalid call (the tool does not run); the result (strings as-is, anything else `JSON.stringify`) on success; `Tool error: <message>` if `run` throws;
- after `maxSteps` model calls without a final answer → stop with `"max-steps"`;
- return `{ stopReason, text, messages, steps, toolCalls }`; errors thrown by the model propagate.

## Going further
Run independent calls in parallel, add a wall-clock deadline and a token budget, and emit an OpenTelemetry span per step and per tool call. Step 24 makes tool failures retryable and safe to repeat.
