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
  return {
    "@odata.type": "#Microsoft.Skills.Util.ShaperSkill" as const,
    name: "chunk-shape",
    context: "/document",
    inputs: [
      { name: "id", source: "/document/id" },
      { name: "title", source: "/document/title" },
      { name: "sourceUri", source: "/document/sourceUri" },
      { name: "language", source: "/document/language" },
      { name: "keyPhrases", source: "/document/keyPhrases" },
    ],
    outputs: [{ name: "output", targetName: "chunkShape" }],
  };
}

/** One projection group: a chunk table, a key phrase table (one row per phrase) and the whole shape as a JSON object. */
export function northbankKnowledgeStore(storageAccountId: string): KnowledgeStore {
  return {
    storageConnectionString: `ResourceId=${storageAccountId};`,
    projections: [
      {
        tables: [
          { tableName: "northbankChunks", generatedKeyName: "chunkKey", source: "/document/chunkShape" },
          { tableName: "northbankKeyPhrases", generatedKeyName: "phraseKey", source: "/document/chunkShape/keyPhrases/*" },
        ],
        objects: [{ storageContainer: "northbank-enriched", generatedKeyName: "objectKey", source: "/document/chunkShape" }],
        files: [],
      },
    ],
  };
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
  const problems: Problem[] = [];
  if (!/^ResourceId=\/subscriptions\/[^;]+;$/.test(store.storageConnectionString))
    problems.push({ rule: "connection", message: "use a keyless ResourceId=…; connection string, not an account key" });
  const targets = new Map<string, number>();
  store.projections.forEach((group, g) => {
    if (group.tables.length + group.objects.length + group.files.length === 0) problems.push({ rule: "empty-group", message: `projection group ${g} projects nothing` });
    const all = [...group.tables, ...group.objects, ...group.files];
    for (const projection of all) {
      if (!projection.source.startsWith("/document")) problems.push({ rule: "source", message: `${projection.source} must start with /document` });
      else if (!resolves(projection.source, produced)) problems.push({ rule: "source", message: `${projection.source} is not produced by the skillset` });
    }
    for (const t of group.tables) {
      if (!TABLE_NAME.test(t.tableName)) problems.push({ rule: "table-name", message: `${t.tableName}: 3–63 letters and digits, starting with a letter` });
      targets.set(`table ${t.tableName}`, (targets.get(`table ${t.tableName}`) ?? 0) + 1);
    }
    for (const o of [...group.objects, ...group.files]) {
      if (!CONTAINER_NAME.test(o.storageContainer)) problems.push({ rule: "container-name", message: `${o.storageContainer}: 3–63 lower-case letters, digits and single hyphens` });
      targets.set(`container ${o.storageContainer}`, (targets.get(`container ${o.storageContainer}`) ?? 0) + 1);
    }
    for (const f of group.files)
      if (!f.source.startsWith("/document/normalized_images/")) problems.push({ rule: "file-source", message: `file projections hold images: ${f.source} is not under /document/normalized_images/*` });
  });
  for (const [target, count] of targets) if (count > 1) problems.push({ rule: "duplicate-target", message: `${target} is written by ${count} projections` });
  return problems;
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
  const each = table.source.endsWith("/*");
  const node = nodeAt(tree, table.source.replace(/\/\*$/, ""));
  if (node === undefined || node === null) return [];
  const key = (i: number) => `${documentKey}_${table.tableName}_${i}`;
  if (each) {
    if (!Array.isArray(node)) throw new Error(`${table.source} is not a collection`);
    return node.map((value, i) => ({
      [table.generatedKeyName]: key(i),
      documentKey,
      ...(value !== null && typeof value === "object" ? (value as Record<string, unknown>) : { value }),
    }));
  }
  if (typeof node !== "object" || Array.isArray(node)) throw new Error(`${table.source} is not an object; shape it first`);
  return [{ [table.generatedKeyName]: key(0), documentKey, ...(node as Record<string, unknown>) }];
}
