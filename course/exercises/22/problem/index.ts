// A knowledge store persists enrichments to Azure Storage. This step models one offline; nothing here is deployed.

export interface TableProjection {
  tableName: string;
  generatedKeyName: string;
  source: string;
}
export interface ObjectProjection {
  storageContainer: string;
  generatedKeyName?: string;
  source: string;
}
export interface FileProjection {
  storageContainer: string;
  generatedKeyName?: string;
  source: string;
}
export interface ProjectionGroup {
  tables: TableProjection[];
  objects: ObjectProjection[];
  files: FileProjection[];
}
export interface KnowledgeStore {
  storageConnectionString: string;
  projections: ProjectionGroup[];
}
export interface Problem {
  rule: "connection" | "source" | "table-name" | "container-name" | "file-source" | "empty-group" | "duplicate-target";
  message: string;
}
export type EnrichmentTree = { document: Record<string, unknown> };

export interface ShaperSkill {
  "@odata.type": "#Microsoft.Skills.Util.ShaperSkill";
  name: string;
  context: string;
  inputs: { name: string; source: string }[];
  outputs: { name: string; targetName: string }[];
}

/** The Shaper skill that gathers one chunk's enrichments into a single node for projection. */
export function chunkShaper(): ShaperSkill {
  // TODO: a #Microsoft.Skills.Util.ShaperSkill named chunk-shape, context /document, inputs id, title, sourceUri, language and keyPhrases from /document/<name>, output named output with targetName chunkShape.
  throw new Error("Not implemented: chunkShaper");
}

/** One projection group: a chunk table, a key phrase table (one row per phrase) and the whole shape as a JSON object. */
export function northbankKnowledgeStore(storageAccountId: string): KnowledgeStore {
  // TODO: ResourceId=<id>; and one group: tables northbankChunks (chunkKey, /document/chunkShape) and northbankKeyPhrases (phraseKey, /document/chunkShape/keyPhrases/*), object container northbank-enriched (objectKey, /document/chunkShape), no files.
  throw new Error("Not implemented: northbankKnowledgeStore");
}

const TABLE_NAME = /^[A-Za-z][A-Za-z0-9]{2,62}$/;
const CONTAINER_NAME = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,62}$/;

/** Does `path` exist, given the nodes the skillset produces? A trailing /* selects each element of a produced collection. */
function resolves(path: string, produced: string[]): boolean {
  const base = path.replace(/\/\*$/, "");
  return produced.some((p) => base === p || base.startsWith(`${p}/`));
}

/** Review a knowledge store definition before it can write anything. */
export function reviewKnowledgeStore(store: KnowledgeStore, produced: string[]): Problem[] {
  // TODO: rules: connection (keyless ResourceId), source (starts with /document and is produced), table-name, container-name, file-source (/document/normalized_images/*), empty-group, duplicate-target across all groups.
  throw new Error("Not implemented: reviewKnowledgeStore");
}

function nodeAt(tree: EnrichmentTree, path: string): unknown {
  let node: unknown = tree;
  for (const part of path.split("/").filter(Boolean)) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/**
 * The rows a table projection writes for one document (a model: the service's generated keys have their own format).
 * An object source is one row of its properties; a collection source ending in /* is one row per element, related to
 * the document by `documentKey`.
 */
export function projectTable(tree: EnrichmentTree, documentKey: string, table: TableProjection): Record<string, unknown>[] {
  // TODO: read the node at the source (without a trailing /*); missing is no rows; /* means one row per element with generatedKeyName, documentKey and the element (or { value }); otherwise one row of the object; key = <documentKey>_<tableName>_<i>.
  throw new Error("Not implemented: projectTable");
}
