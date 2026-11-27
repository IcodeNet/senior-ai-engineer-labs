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

export function validateArgs(schema: JsonSchema, value: unknown, path = "$"): ValidationError[] {
  // TODO: check the type, then the keyword constraints; recurse into array items and object properties with a JSON path.
  // Use Object.hasOwn, never `in`: `in` also sees inherited keys such as "constructor" and "toString".
  throw new Error("Not implemented: validateArgs");
}

export function formatErrors(errors: ValidationError[]): string {
  return errors.map((error) => `${error.path}: ${error.message}`).join("; ");
}

export function parseToolCall(tools: ToolDefinition[], call: RawToolCall): ParsedToolCall {
  // TODO: find the tool, parse the JSON arguments, validate them, and return an error the model can act on.
  throw new Error("Not implemented: parseToolCall");
}

export function lintToolDefinition(tool: ToolDefinition): string[] {
  // TODO: report names, descriptions and schemas that will confuse a model.
  throw new Error("Not implemented: lintToolDefinition");
}
