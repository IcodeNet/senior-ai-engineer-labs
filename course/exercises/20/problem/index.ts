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
  // TODO: northbankIndex(dimensions, PULL_INDEX) plus keyPhrases (Collection(Edm.String): searchable, filterable, facetable, retrievable, not sortable) and language (Edm.String: filterable, facetable, retrievable).
  throw new Error("Not implemented: pullIndex");
}

export function toBlobRecords(documents: SearchDocument[]): PullRecord[] {
  // TODO: drop @search.action from each document.
  throw new Error("Not implemented: toBlobRecords");
}

export function blobUrl(env: StorageEnv, name: string): string {
  // TODO: <blobEndpoint>/<container>/<name>, encoding each path segment, with exactly one slash after the endpoint.
  throw new Error("Not implemented: blobUrl");
}

/** Put Blob with a Microsoft Entra ID token: block blob, a service version that accepts OAuth, JSON content. */
export async function uploadBlob(http: Http, env: StorageEnv, name: string, records: PullRecord[]): Promise<void> {
  // TODO: PUT the JSON text with audience storage and headers x-ms-blob-type BlockBlob, x-ms-version STORAGE_API, content-type application/json; expect 201.
  throw new Error("Not implemented: uploadBlob");
}

const STORAGE_ID = /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.Storage\/storageAccounts\/[a-z0-9]{3,24}$/i;

/**
 * A keyless Blob data source: the connection string is the storage account's resource ID, so the service's identity is
 * used. container.query limits it to one virtual folder.
 */
export function dataSourceDefinition(env: StorageEnv, name = DATA_SOURCE, folder = FOLDER): DataSource {
  // TODO: type azureblob, connection string ResourceId=<storage account id>; (no key), container { name, query: folder }; reject anything that is not a storage account resource ID.
  throw new Error("Not implemented: dataSourceDefinition");
}

/** Each element of every .json blob's top-level array becomes one search document. The element's id is the key. */
export function indexerDefinition(): Indexer {
  // TODO: data source → PULL_INDEX with parsingMode jsonArray and indexedFileNameExtensions .json; no field mappings.
  throw new Error("Not implemented: indexerDefinition");
}

/**
 * A model of what a jsonArray indexer does with blobs, for reasoning offline. Each element becomes a document; its key is
 * the element's key field, or a generated stand-in from the blob path and position (Azure generates its own value, which
 * you must not rely on). A key seen twice merges: non-null values overwrite, null values keep what was there.
 */
export function simulateJsonArray(blobs: { path: string; content: string }[], keyField: string): Simulation {
  // TODO: parse each blob; errors for invalid JSON, a non-array or a non-object element; key = element[keyField] or base64url(path;i); a repeated key merges non-null values.
  throw new Error("Not implemented: simulateJsonArray");
}

export type Collection = "indexes" | "datasources" | "indexers" | "skillsets";

/** PUT /<collection>/<name>. Returns 201 when created, 200 when updated. */
export async function createOrUpdate(http: Http, endpoint: string, collection: Collection, definition: { name: string }): Promise<number> {
  // TODO: PUT /<collection>/<name>; return 201 or 200; otherwise throw create <collection> <name> failed: <status> <message>.
  throw new Error("Not implemented: createOrUpdate");
}

/** POST /indexers/<name>/run: accepted (202) means it is queued, not finished. */
export async function runIndexer(http: Http, endpoint: string, name: string): Promise<void> {
  // TODO: POST /indexers/<name>/run; expect 202.
  throw new Error("Not implemented: runIndexer");
}

/** Poll /indexers/<name>/status until the run that started at or after `since` finishes; failures are errors. */
export async function waitForIndexer(
  http: Http,
  endpoint: string,
  name: string,
  options: { since: Date; timeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number },
): Promise<IndexerRun> {
  // TODO: poll GET /indexers/<name>/status; ignore a lastResult that started before since; inProgress waits; success returns the counts; any failure or failed item throws; time out after timeoutMs.
  throw new Error("Not implemented: waitForIndexer");
}
