# 71 · Tool schemas and argument validation

## Why it matters
Lab 04 builds an **expenses assistant** for a fictional firm: it looks up policy, converts currencies and submits or refunds claims. Every capability is a **tool** the model can ask to call. A tool definition has three parts — a name, a description and a JSON Schema for its input — and all three are **prompt**: the model chooses tools and fills arguments from them. Vague descriptions and loose schemas produce wrong calls.

Function calling does not make a model's output trustworthy. It returns a name and a JSON *string*; the name can be invented, the JSON can be broken and the values can be out of range, even with "strict" structured-output modes (which constrain shape, not business rules). So:

1. **Validate in code, before running anything.** Type, required fields, enums, ranges, patterns, sizes, and `additionalProperties: false` so the model cannot smuggle extra fields such as `"approve": true`. Check keys with `Object.hasOwn`, never `in`: `"constructor" in {}` is `true`, so `in` lets inherited names slip past both the required and the extra-property checks. And reject `__proto__`, `constructor` and `prototype` outright — `JSON.parse('{"__proto__":{"approve":true}}')` creates an own `__proto__` key, and a later `Object.assign({}, args)` would make `approve` readable on the result (prototype pollution).
2. **Return errors the model can fix.** "`$.amount: must be >= 0.01`" lets the next turn correct itself; a stack trace or a silent failure does not.
3. **Lint the definitions.** Tool names must match `^[a-zA-Z0-9_-]{1,64}$` for the major APIs; every property needs a description.

Validation is a guard, not authorisation: who may submit or refund is decided by your backend (steps 75 and 78), never by the schema or the model.

## Interview question
> Your agent occasionally calls `submit_expense` with an amount in pence instead of pounds, and once with a category that does not exist. What do you change in the tool design, the validation and the feedback loop?

Think about: units in names and descriptions (`amount_gbp`), enums instead of free text, ranges, examples in descriptions, returning validation errors to the model, and logging invalid calls as an evaluation signal.

## Your task
Implement in `index.ts` (the types and `formatErrors` are provided):

- `validateArgs(schema, value, path = "$")` → `ValidationError[]` for the supported JSON Schema subset. Messages:
  - wrong type: `expected <type>` (`string`, `number`, `integer`, `boolean`, `array`, `object`); `NaN`/`Infinity` are not numbers, arrays and `null` are not objects; a wrong type stops further checks on that value;
  - `enum` → `must be one of: A, B`; `minLength`/`maxLength` → `must be at least|at most N characters`; `pattern` → `must match pattern P`; `minimum`/`maximum` → `must be >= N` / `must be <= N`; `maxItems` → `must have at most N items`;
  - objects (use `Object.hasOwn` for every key check): a required key that is not an own property → path `$.key`, `required`; any own key in `RESERVED_KEYS` → `reserved property name` (even when extra keys are allowed); otherwise, with `additionalProperties: false`, a key not defined in `properties` → `unexpected property`; recurse into present properties (`$.key`) and array items (`$.key[0]`).
- `parseToolCall(tools, { name, arguments })` → `{ ok: true, name, args }` or `{ ok: false, error, message, details }`:
  - unknown name → `unknown-tool`, message `Unknown tool "<name>". Available tools: a, b`;
  - unparseable JSON → `invalid-json`, message `Arguments are not valid JSON`;
  - schema errors → `invalid-arguments`, `details` from `validateArgs`, message `Invalid arguments: ` + `formatErrors(details)`.
- `lintToolDefinition(tool)` → problems, in this order: bad name (`name must match ^[a-zA-Z0-9_-]{1,64}$`); description shorter than 20 characters after trimming (`description is too short to guide the model`); non-object input schema (`inputSchema must be an object schema`, then stop); each required key that is not a property (`required property "<key>" is not defined`); for each property in order, a reserved name (`property "<key>" uses a reserved name`) and a missing description (`property "<key>" has no description`); `additionalProperties` not `false` (`inputSchema should set additionalProperties: false`).

## Going further
In production use a full validator (Ajv, or Zod with JSON Schema export) rather than a subset, and compare your schemas with the provider's strict-mode rules. Count invalid calls per tool: a rising rate after a model upgrade is a regression signal.
