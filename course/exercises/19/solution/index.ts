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
  return keys.map((id) => {
    if (!id) throw new Error("a delete needs a document key");
    return { "@search.action": "delete", id };
  });
}

/** A partial update of one existing document. Fields not listed keep their values; a collection is replaced whole. */
export function mergeAction(id: string, fields: Record<string, unknown>): IndexAction {
  if (!id) throw new Error("a merge needs a document key");
  if ("id" in fields || "@search.action" in fields) throw new Error("fields must not contain the key or the action");
  if (Object.keys(fields).length === 0) throw new Error("a merge needs at least one field");
  return { "@search.action": "merge", id, ...fields };
}

/**
 * Split actions into requests within the limits, in order. A key appears at most once per request, because the service
 * gives no ordering guarantee inside a request: a second action for the same key starts a new request.
 */
export function batches(actions: IndexAction[], limits: BatchLimits = LIMITS): IndexAction[][] {
  const envelope = bytes({ value: [] });
  const result: IndexAction[][] = [];
  let current: IndexAction[] = [];
  let size = envelope;
  let keys = new Set<string>();
  for (const action of actions) {
    const cost = bytes(action) + (current.length ? 1 : 0);
    if (envelope + bytes(action) > limits.maxBytes) throw new PayloadTooLargeError(`document ${action.id} alone exceeds ${limits.maxBytes} bytes`);
    if (current.length && (current.length >= limits.maxDocs || size + cost > limits.maxBytes || keys.has(action.id))) {
      result.push(current);
      current = [];
      size = envelope;
      keys = new Set();
    }
    size += bytes(action) + (current.length ? 1 : 0);
    current.push(action);
    keys.add(action.id);
  }
  if (current.length) result.push(current);
  return result;
}

/** POST one request to /docs/index. 200 and 207 return per-document results; 413 is a PayloadTooLargeError. */
export async function indexBatch(http: Http, endpoint: string, index: string, actions: IndexAction[]): Promise<ItemResult[]> {
  const response = await http({
    method: "POST",
    url: `${endpoint}/indexes/${encodeURIComponent(index)}/docs/index?api-version=${SEARCH_API}`,
    body: { value: actions },
    audience: "search",
  });
  if (response.status === 413) throw new PayloadTooLargeError(`request too large: ${actions.length} documents`);
  if (response.status !== 200 && response.status !== 207) throw new Error(`indexing failed: ${response.status} ${azureMessage(response)}`.trim());
  return response.body.value as ItemResult[];
}

/**
 * Push every action: batch within the limits, retry retryable documents with exponential backoff, split a request the
 * service rejects as too large, and report every document that still failed. Never treat 207 as success.
 */
export async function pushAll(http: Http, endpoint: string, index: string, actions: IndexAction[], options: PushOptions = {}): Promise<PushResult> {
  const limits = { maxDocs: options.maxDocs ?? LIMITS.maxDocs, maxBytes: options.maxBytes ?? LIMITS.maxBytes };
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const result: PushResult = { succeeded: 0, failed: [], requests: 0 };

  const send = async (batch: IndexAction[]): Promise<void> => {
    let pending = batch;
    for (let attempt = 0; ; attempt++) {
      let results: ItemResult[];
      try {
        result.requests++;
        results = await indexBatch(http, endpoint, index, pending);
      } catch (error) {
        if (error instanceof PayloadTooLargeError && pending.length > 1) {
          const half = Math.ceil(pending.length / 2);
          await send(pending.slice(0, half));
          await send(pending.slice(half));
          return;
        }
        throw error;
      }
      const retry: IndexAction[] = [];
      for (const item of results) {
        if (item.status) result.succeeded++;
        else if (RETRYABLE.has(item.statusCode) && attempt < retries) retry.push(pending.find((a) => a.id === item.key)!);
        else result.failed.push(item);
      }
      if (!retry.length) return;
      await sleep(baseDelayMs * 2 ** attempt);
      pending = retry;
    }
  };

  for (const batch of batches(actions, limits)) await send(batch);
  return result;
}
