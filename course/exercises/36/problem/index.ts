import { createHmac } from "node:crypto";

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

/**
 * HMAC-SHA-256 keyed with a secret held in a key vault, truncated to 16 hex characters. A plain or salted hash of a
 * guessable ID (u-0001…u-9999) can be reversed by anyone who knows the salt by hashing every candidate; without the
 * key that enumeration is impossible. The output is still personal data under GDPR (pseudonymised, not anonymised).
 */
export function pseudonymise(value: string, key: string): string {
  // TODO: first 16 hex characters of HMAC-SHA-256(key, value); throw on an empty key.
  throw new Error("Not implemented: pseudonymise");
}

/** Masks emails, IBAN-like strings and long digit runs (cards, accounts) in free text. */
export function maskFreeText(text: string): string {
  return text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]")
    .replace(/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g, "[IBAN]")
    .replace(/\d(?:[ -]?\d){12,}/g, "[NUMBER]");
}

export function safeLogRecord(
  event: string,
  fields: Record<string, unknown>,
  policy: { allow: string[]; pseudonymise: string[]; key: string; maxLength?: number },
): Record<string, AttributeValue> {
  // TODO: keep only allow-listed primitives, pseudonymise listed IDs, mask free text, truncate strings, list dropped keys.
  throw new Error("Not implemented: safeLogRecord");
}
