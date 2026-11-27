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
  const done: SpanRecord[] = [];
  return {
    startSpan(name, { parent, attributes = {} } = {}) {
      const traceId = parent ? parent.traceId : options.newId();
      const spanId = options.newId();
      const startMs = options.now();
      const attrs: Record<string, AttributeValue> = { ...attributes };
      let status: "ok" | "error" = "ok";
      let error: string | undefined;
      let ended = false;
      return {
        traceId,
        spanId,
        setAttribute(key, value) {
          if (!ended) attrs[key] = value;
        },
        recordError(err) {
          status = "error";
          error = err instanceof Error ? err.name : "UnknownError";
        },
        end() {
          if (ended) return;
          ended = true;
          const endMs = options.now();
          const record: SpanRecord = { traceId, spanId, name, startMs, endMs, durationMs: endMs - startMs, status, attributes: attrs };
          if (parent) record.parentSpanId = parent.spanId;
          if (error) record.error = error;
          done.push(record);
        },
      };
    },
    finished() {
      return [...done];
    },
  };
}

export async function withSpan<T>(tracer: Tracer, name: string, parent: Span | undefined, fn: (span: Span) => Promise<T>): Promise<T> {
  const span = tracer.startSpan(name, { parent });
  try {
    return await fn(span);
  } catch (error) {
    span.recordError(error);
    throw error;
  } finally {
    span.end();
  }
}

export function summariseTrace(spans: SpanRecord[], traceId: string): TraceSummary {
  const trace = spans.filter((span) => span.traceId === traceId);
  const root = trace.find((span) => span.parentSpanId === undefined);
  if (!root) throw new Error(`no root span for trace ${traceId}`);
  const number = (value: AttributeValue | undefined) => (typeof value === "number" ? value : 0);
  let slowest: SpanRecord | undefined;
  for (const span of trace) if (span !== root && (!slowest || span.durationMs > slowest.durationMs)) slowest = span;
  return {
    totalMs: root.durationMs,
    inputTokens: trace.reduce((sum, span) => sum + number(span.attributes[GEN_AI.inputTokens]), 0),
    outputTokens: trace.reduce((sum, span) => sum + number(span.attributes[GEN_AI.outputTokens]), 0),
    llmCalls: trace.filter((span) => GEN_AI.model in span.attributes).length,
    slowestChild: slowest?.name,
    errors: trace.filter((span) => span.status === "error").length,
  };
}

export function pseudonymise(value: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 16);
}

export function safeLogRecord(
  event: string,
  fields: Record<string, unknown>,
  policy: { allow: string[]; pseudonymise: string[]; salt: string; maxLength?: number },
): Record<string, AttributeValue> {
  const maxLength = policy.maxLength ?? 200;
  const record: Record<string, AttributeValue> = { event };
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (policy.pseudonymise.includes(key) && typeof value === "string") record[key] = pseudonymise(value, policy.salt);
    else if (!policy.allow.includes(key)) dropped.push(key);
    else if (typeof value === "number" || typeof value === "boolean") record[key] = value;
    else if (typeof value === "string")
      record[key] = value.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]").slice(0, maxLength);
    else dropped.push(key);
  }
  if (dropped.length) record.droppedFields = dropped.sort().join(",");
  return record;
}
