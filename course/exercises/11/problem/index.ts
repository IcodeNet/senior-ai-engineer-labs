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
  // TODO: fields id (key), title, chunk, sourceUri, status, effectiveDate, expiryDate and contentVector, every attribute set explicitly; one hnsw algorithm and one profile.
  throw new Error("Not implemented: northbankIndex");
}

/** A stable, URL-safe key per chunk: base64url of "<sourceUri>#<chunkIndex>". Keys may use letters, digits, '-', '_' and '='. */
export function documentKey(sourceUri: string, chunkIndex: number): string {
  // TODO: base64url of '<sourceUri>#<chunkIndex>'; validate both inputs; reject keys over 1024 characters.
  throw new Error("Not implemented: documentKey");
}

function isoDate(value: string, label: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = match ? new Date(`${value}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new Error(`${label} must be a real YYYY-MM-DD date: ${value}`);
  return `${value}T00:00:00Z`;
}

export function toSearchDocuments(source: FaqSource): SearchDocument[] {
  // TODO: validate status and real YYYY-MM-DD dates (expiry not before effective), then one mergeOrUpload document per chunk with 'T00:00:00Z' dates and expiryDate null when absent.
  throw new Error("Not implemented: toSearchDocuments");
}

export function reviewGovernance(definition: IndexDefinition): Finding[] {
  // TODO: start with step 10's validateIndex problems as rule 'schema', then missing fields, governance types and filterable flags, chunk attributes, sourceUri retrievable, explicit attributes on non-vector fields.
  throw new Error("Not implemented: reviewGovernance");
}
