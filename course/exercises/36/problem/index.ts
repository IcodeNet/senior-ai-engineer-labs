import { createHash } from "node:crypto";

export type AttributeValue = string | number | boolean;

export interface SpanRecord {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  status: "ok" | "error";
  error?: string;
  attributes: Record<string, AttributeValue>;
}

export interface Span {
  readonly traceId: string;
  readonly spanId: string;
  setAttribute(key: string, value: AttributeValue): void;
  recordError(error: unknown): void;
  end(): void;
}

export interface Tracer {
  startSpan(name: string, options?: { parent?: Span; attributes?: Record<string, AttributeValue> }): Span;
  finished(): SpanRecord[];
}

export interface TraceSummary {
  totalMs: number;
  inputTokens: number;
  outputTokens: number;
  llmCalls: number;
  slowestChild?: string;
  errors: number;
}

/** OpenTelemetry GenAI semantic-convention attribute names. */
export const GEN_AI = {
  model: "gen_ai.request.model",
  inputTokens: "gen_ai.usage.input_tokens",
  outputTokens: "gen_ai.usage.output_tokens",
} as const;

export function createTracer(options: { now: () => number; newId: () => string }): Tracer {
  // TODO: return a tracer whose spans inherit the parent's traceId, record start/end from now(), and are kept in finished() in end order.
  throw new Error("Not implemented: createTracer");
}

export async function withSpan<T>(tracer: Tracer, name: string, parent: Span | undefined, fn: (span: Span) => Promise<T>): Promise<T> {
  // TODO: start a child span, run fn, record the error on failure (and rethrow), always end the span.
  throw new Error("Not implemented: withSpan");
}

export function summariseTrace(spans: SpanRecord[], traceId: string): TraceSummary {
  // TODO: for one trace: root duration, summed GEN_AI token attributes, spans with a model attribute, slowest non-root span, error count.
  throw new Error("Not implemented: summariseTrace");
}

export function pseudonymise(value: string, salt: string): string {
  // TODO: first 16 hex characters of sha256('<salt>:<value>').
  throw new Error("Not implemented: pseudonymise");
}

export function safeLogRecord(
  event: string,
  fields: Record<string, unknown>,
  policy: { allow: string[]; pseudonymise: string[]; salt: string; maxLength?: number },
): Record<string, AttributeValue> {
  // TODO: keep only allow-listed primitives, pseudonymise listed IDs, mask emails, truncate strings, list dropped keys.
  throw new Error("Not implemented: safeLogRecord");
}
