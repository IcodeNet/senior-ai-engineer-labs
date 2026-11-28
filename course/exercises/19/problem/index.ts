import { SEARCH_API, azureMessage, type Http } from "./azure.ts";

export type SearchAction = "upload" | "merge" | "mergeOrUpload" | "delete";
export interface IndexAction {
  "@search.action": SearchAction;
  id: string;
  [field: string]: unknown;
}
/** One entry of a Documents - Index response. */
export interface ItemResult {
  key: string;
  status: boolean;
  statusCode: number;
  errorMessage?: string | null;
}
export interface BatchLimits {
  maxDocs: number;
  maxBytes: number;
}
export interface PushOptions extends Partial<BatchLimits> {
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}
export interface PushResult {
  succeeded: number;
  failed: ItemResult[];
  requests: number;
}

/** The service's limits for one Documents - Index request: 1,000 documents or about 16 MB, whichever comes first. */
export const LIMITS: BatchLimits = { maxDocs: 1000, maxBytes: 16 * 1024 * 1024 };
/** Per-document status codes worth retrying after a delay: version conflict, index temporarily unavailable, service busy. */
export const RETRYABLE: ReadonlySet<number> = new Set([409, 422, 503]);

export class PayloadTooLargeError extends Error {}

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

/** Delete by key: every other field in a delete action is ignored, so send only the key. */
export function deleteActions(keys: string[]): IndexAction[] {
  // TODO: one { "@search.action": "delete", id } per key; reject an empty key.
  throw new Error("Not implemented: deleteActions");
}

/** A partial update of one existing document. Fields not listed keep their values; a collection is replaced whole. */
export function mergeAction(id: string, fields: Record<string, unknown>): IndexAction {
  // TODO: { "@search.action": "merge", id, ...fields }; reject an empty key, no fields, or fields that contain id or @search.action.
  throw new Error("Not implemented: mergeAction");
}

/**
 * Split actions into requests within the limits, in order. A key appears at most once per request, because the service
 * gives no ordering guarantee inside a request: a second action for the same key starts a new request.
 */
export function batches(actions: IndexAction[], limits: BatchLimits = LIMITS): IndexAction[][] {
  // TODO: split in order within maxDocs and maxBytes (measure the JSON request body); start a new request when a key repeats; throw PayloadTooLargeError for one document over the limit.
  throw new Error("Not implemented: batches");
}

/** POST one request to /docs/index. 200 and 207 return per-document results; 413 is a PayloadTooLargeError. */
export async function indexBatch(http: Http, endpoint: string, index: string, actions: IndexAction[]): Promise<ItemResult[]> {
  // TODO: POST { value: actions } to /indexes/<index>/docs/index; 200 or 207 return body.value; 413 throws PayloadTooLargeError; others throw indexing failed: <status> <message>.
  throw new Error("Not implemented: indexBatch");
}

/**
 * Push every action: batch within the limits, retry retryable documents with exponential backoff, split a request the
 * service rejects as too large, and report every document that still failed. Never treat 207 as success.
 */
export async function pushAll(http: Http, endpoint: string, index: string, actions: IndexAction[], options: PushOptions = {}): Promise<PushResult> {
  // TODO: for each batch: send, count successes, retry RETRYABLE documents with sleep(baseDelayMs × 2^attempt) up to retries, split a 413 request in half, report the rest as failed.
  throw new Error("Not implemented: pushAll");
}
