import { isVector, validateIndex, type Field, type IndexDefinition } from "./schema.ts";

export type Status = "draft" | "approved" | "retired";

/** One FAQ answer as the content team publishes it, already split into chunks (chunking is Module 4). */
export interface FaqSource {
  sourceUri: string;
  title: string;
  chunks: string[];
  status: Status;
  /** YYYY-MM-DD */
  effectiveDate: string;
  /** YYYY-MM-DD, or undefined when the answer has no end date. */
  expiryDate?: string;
}

export interface SearchDocument {
  "@search.action": "mergeOrUpload";
  id: string;
  title: string;
  chunk: string;
  sourceUri: string;
  status: Status;
  effectiveDate: string;
  expiryDate: string | null;
}

export interface Finding {
  field: string;
  rule: "missing-field" | "governance-filterable" | "governance-type" | "chunk-too-long-to-filter" | "citation-retrievable" | "explicit-attributes" | "schema";
  message: string;
}

export const INDEX_NAME = "northbank-faq-v1";
export const STATUSES: readonly Status[] = ["draft", "approved", "retired"];
const ATTRIBUTES = ["searchable", "filterable", "retrievable", "sortable", "facetable"] as const;

export function northbankIndex(dimensions: number): IndexDefinition {
  const plain = (name: string, type: Field["type"], searchable: boolean, filterable: boolean, sortable: boolean, facetable: boolean): Field => ({
    name,
    type,
    searchable,
    filterable,
    retrievable: true,
    sortable,
    facetable,
  });
  return {
    name: INDEX_NAME,
    description: "Northbank Support FAQ chunks. Only status 'approved' and in-date chunks may be sent to a model.",
    fields: [
      { ...plain("id", "Edm.String", false, true, false, false), key: true },
      plain("title", "Edm.String", true, false, false, false),
      plain("chunk", "Edm.String", true, false, false, false),
      plain("sourceUri", "Edm.String", false, true, false, false),
      plain("status", "Edm.String", false, true, false, true),
      plain("effectiveDate", "Edm.DateTimeOffset", false, true, true, false),
      plain("expiryDate", "Edm.DateTimeOffset", false, true, true, false),
      {
        name: "contentVector",
        type: "Collection(Edm.Single)",
        searchable: true,
        retrievable: false,
        dimensions,
        vectorSearchProfile: "northbank-vector-profile",
      },
    ],
    vectorSearch: {
      algorithms: [{ name: "northbank-hnsw", kind: "hnsw" }],
      profiles: [{ name: "northbank-vector-profile", algorithm: "northbank-hnsw" }],
    },
  };
}

/** A stable, URL-safe key per chunk: base64url of "<sourceUri>#<chunkIndex>". Keys may use letters, digits, '-', '_' and '='. */
export function documentKey(sourceUri: string, chunkIndex: number): string {
  if (!sourceUri) throw new Error("sourceUri is required");
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) throw new Error("chunkIndex must be a non-negative integer");
  const key = Buffer.from(`${sourceUri}#${chunkIndex}`, "utf8").toString("base64url");
  if (key.length > 1024) throw new Error("document key longer than 1024 characters");
  return key;
}

function isoDate(value: string, label: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(`${value}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error(`${label} must be a real YYYY-MM-DD date: ${value}`);
  return `${value}T00:00:00Z`;
}

export function toSearchDocuments(source: FaqSource): SearchDocument[] {
  if (!STATUSES.includes(source.status)) throw new Error(`unknown status: ${source.status}`);
  if (source.chunks.length === 0) throw new Error("a source needs at least one chunk");
  const effectiveDate = isoDate(source.effectiveDate, "effectiveDate");
  const expiryDate = source.expiryDate === undefined ? null : isoDate(source.expiryDate, "expiryDate");
  if (expiryDate !== null && expiryDate < effectiveDate) throw new Error("expiryDate is before effectiveDate");
  return source.chunks.map((chunk, i) => ({
    "@search.action": "mergeOrUpload",
    id: documentKey(source.sourceUri, i),
    title: source.title,
    chunk,
    sourceUri: source.sourceUri,
    status: source.status,
    effectiveDate,
    expiryDate,
  }));
}

export function reviewGovernance(definition: IndexDefinition): Finding[] {
  const findings: Finding[] = validateIndex(definition).map((p) => ({ field: p.path.replace(/^fields\./, ""), rule: "schema", message: `${p.rule}: ${p.message}` }));
  const field = (name: string) => definition.fields.find((f) => f.name === name);
  const governance: [string, string][] = [
    ["status", "Edm.String"],
    ["effectiveDate", "Edm.DateTimeOffset"],
    ["expiryDate", "Edm.DateTimeOffset"],
  ];
  for (const name of ["id", "title", "chunk", "sourceUri", "status", "effectiveDate", "expiryDate", "contentVector"])
    if (!field(name)) findings.push({ field: name, rule: "missing-field", message: `the Northbank schema needs ${name}` });
  for (const [name, type] of governance) {
    const f = field(name);
    if (!f) continue;
    if (f.type !== type) findings.push({ field: name, rule: "governance-type", message: `${name} must be ${type}` });
    if (f.filterable !== true) findings.push({ field: name, rule: "governance-filterable", message: `${name} must be explicitly filterable so the server can enforce it` });
  }
  const chunk = field("chunk");
  if (chunk && (chunk.filterable !== false || chunk.sortable !== false || chunk.facetable !== false))
    findings.push({ field: "chunk", rule: "chunk-too-long-to-filter", message: "chunk text can exceed 32 KB: set filterable, sortable and facetable to false" });
  const source = field("sourceUri");
  if (source && source.retrievable !== true)
    findings.push({ field: "sourceUri", rule: "citation-retrievable", message: "sourceUri must be retrievable or answers cannot cite it" });
  for (const f of definition.fields)
    if (!isVector(f.type) && ATTRIBUTES.some((a) => f[a] === undefined))
      findings.push({ field: f.name, rule: "explicit-attributes", message: "set all five attributes explicitly; REST and SDK defaults differ" });
  return findings;
}
