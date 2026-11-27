export type Status = "draft" | "approved" | "revoked";

export interface SourceDocument {
  id: string;
  title: string;
  text: string;
  status: Status;
  version: number;
  effectiveDate: string;
}

export interface Chunk {
  id: string;
  docId: string;
  chunkIndex: number;
  title: string;
  text: string;
  status: Status;
  version: number;
  effectiveDate: string;
}

export interface ChunkOptions {
  size: number;
  overlap: number;
}

export function tokenize(text: string): string[] {
  // TODO: split on whitespace and drop empty tokens.
  throw new Error("Not implemented: tokenize");
}

export function chunkDocument(doc: SourceDocument, options: ChunkOptions): Chunk[] {
  // TODO: validate options, then build overlapping word windows that carry the document metadata.
  throw new Error("Not implemented: chunkDocument");
}
