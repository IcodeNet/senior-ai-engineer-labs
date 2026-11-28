import { SEARCH_API, STORAGE_API, azureMessage, type AzureEnv, type Http } from "./azure.ts";
import { northbankIndex, type IndexDefinition, type SearchDocument } from "./northbank.ts";

export const PULL_INDEX = "northbank-faq-pull-v1";
export const DATA_SOURCE = "northbank-blob";
export const INDEXER = "northbank-blob-indexer";
/** Blobs for this data source live under faq/ in the container; other data sources read other folders. */
export const FOLDER = "faq/";
export const BLOB = `${FOLDER}northbank-faq.json`;

/** One element of the JSON array in the blob: a search document without the push action. */
export type PullRecord = Omit<SearchDocument, "@search.action">;
type StorageEnv = Pick<Required<AzureEnv>, "blobEndpoint" | "storageContainer" | "storageAccountId">;

export interface DataSource {
  name: string;
  type: "azureblob";
  credentials: { connectionString: string };
  container: { name: string; query?: string };
}
export interface Indexer {
  name: string;
  dataSourceName: string;
  targetIndexName: string;
  skillsetName?: string;
  parameters: { configuration: Record<string, string> };
  fieldMappings: { sourceFieldName: string; targetFieldName: string; mappingFunction?: { name: string } }[];
  outputFieldMappings?: { sourceFieldName: string; targetFieldName: string }[];
}
export interface IndexerRun {
  itemsProcessed: number;
  itemsFailed: number;
  warnings: string[];
}
export interface Simulation {
  documents: Record<string, unknown>[];
  /** Keys that more than one element produced: later elements merged into earlier ones. */
  merged: string[];
  errors: string[];
}

/** The pull index: the Northbank schema plus the enrichment fields step 21 fills (null until then). */
export function pullIndex(dimensions: number): IndexDefinition {
  const index = northbankIndex(dimensions, PULL_INDEX);
  index.fields.push(
    { name: "keyPhrases", type: "Collection(Edm.String)", searchable: true, filterable: true, retrievable: true, sortable: false, facetable: true },
    { name: "language", type: "Edm.String", searchable: false, filterable: true, retrievable: true, sortable: false, facetable: true },
  );
  return index;
}

export function toBlobRecords(documents: SearchDocument[]): PullRecord[] {
  return documents.map(({ "@search.action": _action, ...record }) => record);
}

export function blobUrl(env: StorageEnv, name: string): string {
  const base = env.blobEndpoint.endsWith("/") ? env.blobEndpoint : `${env.blobEndpoint}/`;
  return `${base}${env.storageContainer}/${name.split("/").map(encodeURIComponent).join("/")}`;
}

/** Put Blob with a Microsoft Entra ID token: block blob, a service version that accepts OAuth, JSON content. */
export async function uploadBlob(http: Http, env: StorageEnv, name: string, records: PullRecord[]): Promise<void> {
  const response = await http({
    method: "PUT",
    url: blobUrl(env, name),
    body: JSON.stringify(records),
    audience: "storage",
    headers: { "x-ms-blob-type": "BlockBlob", "x-ms-version": STORAGE_API, "content-type": "application/json" },
  });
  if (response.status !== 201) throw new Error(`blob upload failed: ${response.status}`);
}

const STORAGE_ID = /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.Storage\/storageAccounts\/[a-z0-9]{3,24}$/i;

/**
 * A keyless Blob data source: the connection string is the storage account's resource ID, so the service's identity is
 * used. container.query limits it to one virtual folder.
 */
export function dataSourceDefinition(env: StorageEnv, name = DATA_SOURCE, folder = FOLDER): DataSource {
  if (!STORAGE_ID.test(env.storageAccountId)) throw new Error(`not a storage account resource ID: ${env.storageAccountId}`);
  return { name, type: "azureblob", credentials: { connectionString: `ResourceId=${env.storageAccountId};` }, container: { name: env.storageContainer, query: folder } };
}

/** Each element of every .json blob's top-level array becomes one search document. The element's id is the key. */
export function indexerDefinition(): Indexer {
  return {
    name: INDEXER,
    dataSourceName: DATA_SOURCE,
    targetIndexName: PULL_INDEX,
    parameters: { configuration: { parsingMode: "jsonArray", indexedFileNameExtensions: ".json" } },
    fieldMappings: [],
  };
}

/**
 * A model of what a jsonArray indexer does with blobs, for reasoning offline. Each element becomes a document; its key is
 * the element's key field, or a generated stand-in from the blob path and position (Azure generates its own value, which
 * you must not rely on). A key seen twice merges: non-null values overwrite, null values keep what was there.
 */
export function simulateJsonArray(blobs: { path: string; content: string }[], keyField: string): Simulation {
  const byKey = new Map<string, Record<string, unknown>>();
  const merged = new Set<string>();
  const errors: string[] = [];
  for (const blob of blobs) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(blob.content);
    } catch {
      errors.push(`${blob.path}: not valid JSON`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      errors.push(`${blob.path}: the top level is not a JSON array`);
      continue;
    }
    parsed.forEach((element, i) => {
      if (element === null || typeof element !== "object" || Array.isArray(element)) {
        errors.push(`${blob.path}[${i}]: an element is not a JSON object`);
        return;
      }
      const own = (element as Record<string, unknown>)[keyField];
      const key = typeof own === "string" && own !== "" ? own : Buffer.from(`${blob.path};${i}`).toString("base64url");
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...(element as Record<string, unknown>), [keyField]: key });
        return;
      }
      merged.add(key);
      for (const [field, value] of Object.entries(element)) if (value !== null && value !== undefined) existing[field] = value;
    });
  }
  return { documents: [...byKey.values()], merged: [...merged], errors };
}

export type Collection = "indexes" | "datasources" | "indexers" | "skillsets";

/** PUT /<collection>/<name>. Returns 201 when created, 200 when updated. */
export async function createOrUpdate(http: Http, endpoint: string, collection: Collection, definition: { name: string }): Promise<number> {
  const response = await http({
    method: "PUT",
    url: `${endpoint}/${collection}/${encodeURIComponent(definition.name)}?api-version=${SEARCH_API}`,
    body: definition,
    audience: "search",
  });
  if (response.status !== 200 && response.status !== 201) throw new Error(`create ${collection} ${definition.name} failed: ${response.status} ${azureMessage(response)}`.trim());
  return response.status;
}

/** POST /indexers/<name>/run: accepted (202) means it is queued, not finished. */
export async function runIndexer(http: Http, endpoint: string, name: string): Promise<void> {
  const response = await http({ method: "POST", url: `${endpoint}/indexers/${encodeURIComponent(name)}/run?api-version=${SEARCH_API}`, audience: "search" });
  if (response.status !== 202) throw new Error(`run indexer ${name} failed: ${response.status} ${azureMessage(response)}`.trim());
}

/** Poll /indexers/<name>/status until the run that started at or after `since` finishes; failures are errors. */
export async function waitForIndexer(
  http: Http,
  endpoint: string,
  name: string,
  options: { since: Date; timeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number },
): Promise<IndexerRun> {
  const { since, timeoutMs = 120_000, pollMs = 2_000 } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + timeoutMs;
  for (;;) {
    const response = await http({ method: "GET", url: `${endpoint}/indexers/${encodeURIComponent(name)}/status?api-version=${SEARCH_API}`, audience: "search" });
    if (response.status !== 200) throw new Error(`indexer status failed: ${response.status} ${azureMessage(response)}`.trim());
    if (response.body.status === "error") throw new Error(`indexer ${name} is in an error state`);
    const last = response.body.lastResult;
    const current = last && Date.parse(last.startTime) >= since.getTime() ? last : undefined;
    if (current && current.status !== "inProgress") {
      const errors: { key?: string; errorMessage: string }[] = current.errors ?? [];
      const warnings: string[] = (current.warnings ?? []).map((w: { message: string }) => w.message);
      if (current.status !== "success") throw new Error(`indexer ${name} ${current.status}: ${errors[0]?.errorMessage ?? current.errorMessage ?? "no details"}`);
      if (current.itemsFailed > 0) throw new Error(`indexer ${name}: ${current.itemsFailed} item(s) failed: ${errors[0]?.key ?? "?"}: ${errors[0]?.errorMessage ?? ""}`.trim());
      return { itemsProcessed: current.itemsProcessed, itemsFailed: current.itemsFailed, warnings };
    }
    if (now() >= deadline) throw new Error(`indexer ${name} did not finish within ${timeoutMs} ms`);
    await sleep(pollMs);
  }
}
