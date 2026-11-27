export type JsonSchema =
  | { type: "string"; description?: string; enum?: string[]; minLength?: number; maxLength?: number; pattern?: string }
  | { type: "number" | "integer"; description?: string; minimum?: number; maximum?: number }
  | { type: "boolean"; description?: string }
  | { type: "array"; description?: string; items: JsonSchema; maxItems?: number }
  | ObjectSchema;

export interface ObjectSchema {
  type: "object";
  description?: string;
  properties: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ObjectSchema;
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface RawToolCall {
  name: string;
  arguments: string;
}

export type ParsedToolCall =
  | { ok: true; name: string; args: Record<string, unknown> }
  | { ok: false; error: "unknown-tool" | "invalid-json" | "invalid-arguments"; message: string; details: ValidationError[] };

export const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/** Keys that can reach or replace an object's prototype; never accept them from a model. */
export const RESERVED_KEYS = ["__proto__", "constructor", "prototype"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateArgs(schema: JsonSchema, value: unknown, path = "$"): ValidationError[] {
  const fail = (message: string): ValidationError[] => [{ path, message }];
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") return fail("expected string");
      const errors: ValidationError[] = [];
      if (schema.enum && !schema.enum.includes(value)) errors.push({ path, message: `must be one of: ${schema.enum.join(", ")}` });
      if (schema.minLength !== undefined && value.length < schema.minLength)
        errors.push({ path, message: `must be at least ${schema.minLength} characters` });
      if (schema.maxLength !== undefined && value.length > schema.maxLength)
        errors.push({ path, message: `must be at most ${schema.maxLength} characters` });
      if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value))
        errors.push({ path, message: `must match pattern ${schema.pattern}` });
      return errors;
    }
    case "number":
    case "integer": {
      if (typeof value !== "number" || !Number.isFinite(value)) return fail(`expected ${schema.type}`);
      if (schema.type === "integer" && !Number.isInteger(value)) return fail("expected integer");
      const errors: ValidationError[] = [];
      if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path, message: `must be >= ${schema.minimum}` });
      if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path, message: `must be <= ${schema.maximum}` });
      return errors;
    }
    case "boolean":
      return typeof value === "boolean" ? [] : fail("expected boolean");
    case "array": {
      if (!Array.isArray(value)) return fail("expected array");
      const errors: ValidationError[] =
        schema.maxItems !== undefined && value.length > schema.maxItems ? [{ path, message: `must have at most ${schema.maxItems} items` }] : [];
      value.forEach((item, index) => errors.push(...validateArgs(schema.items, item, `${path}[${index}]`)));
      return errors;
    }
    case "object": {
      if (!isObject(value)) return fail("expected object");
      const errors: ValidationError[] = [];
      for (const key of schema.required ?? [])
        if (!Object.hasOwn(value, key)) errors.push({ path: `${path}.${key}`, message: "required" });
      for (const [key, child] of Object.entries(schema.properties))
        if (Object.hasOwn(value, key)) errors.push(...validateArgs(child, value[key], `${path}.${key}`));
      for (const key of Object.keys(value)) {
        if (RESERVED_KEYS.includes(key)) errors.push({ path: `${path}.${key}`, message: "reserved property name" });
        else if (schema.additionalProperties === false && !Object.hasOwn(schema.properties, key))
          errors.push({ path: `${path}.${key}`, message: "unexpected property" });
      }
      return errors;
    }
  }
}

export function formatErrors(errors: ValidationError[]): string {
  return errors.map((error) => `${error.path}: ${error.message}`).join("; ");
}

export function parseToolCall(tools: ToolDefinition[], call: RawToolCall): ParsedToolCall {
  const tool = tools.find((candidate) => candidate.name === call.name);
  if (!tool)
    return {
      ok: false,
      error: "unknown-tool",
      message: `Unknown tool "${call.name}". Available tools: ${tools.map((t) => t.name).join(", ")}`,
      details: [],
    };
  let args: unknown;
  try {
    args = JSON.parse(call.arguments);
  } catch {
    return { ok: false, error: "invalid-json", message: "Arguments are not valid JSON", details: [] };
  }
  const details = validateArgs(tool.inputSchema, args);
  if (details.length > 0 || !isObject(args))
    return { ok: false, error: "invalid-arguments", message: `Invalid arguments: ${formatErrors(details)}`, details };
  return { ok: true, name: tool.name, args };
}

export function lintToolDefinition(tool: ToolDefinition): string[] {
  const problems: string[] = [];
  if (!TOOL_NAME.test(tool.name)) problems.push("name must match ^[a-zA-Z0-9_-]{1,64}$");
  if (tool.description.trim().length < 20) problems.push("description is too short to guide the model");
  if (tool.inputSchema.type !== "object") {
    problems.push("inputSchema must be an object schema");
    return problems;
  }
  for (const key of tool.inputSchema.required ?? [])
    if (!Object.hasOwn(tool.inputSchema.properties, key)) problems.push(`required property "${key}" is not defined`);
  for (const [key, schema] of Object.entries(tool.inputSchema.properties)) {
    if (RESERVED_KEYS.includes(key)) problems.push(`property "${key}" uses a reserved name`);
    if (!schema.description?.trim()) problems.push(`property "${key}" has no description`);
  }
  if (tool.inputSchema.additionalProperties !== false) problems.push("inputSchema should set additionalProperties: false");
  return problems;
}
