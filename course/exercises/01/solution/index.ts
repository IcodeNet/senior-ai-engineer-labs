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
  return text.split(/\s+/).filter((token) => token.length > 0);
}

export function chunkDocument(doc: SourceDocument, options: ChunkOptions): Chunk[] {
  const { size, overlap } = options;
  if (!Number.isInteger(size) || size <= 0) throw new RangeError("size must be a positive integer");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= size)
    throw new RangeError("overlap must be an integer in [0, size)");
  const words = tokenize(doc.text);
  const chunks: Chunk[] = [];
  const step = size - overlap;
  for (let start = 0; start < words.length; start += step) {
    const end = Math.min(start + size, words.length);
    const chunkIndex = chunks.length;
    chunks.push({
      id: `${doc.id}#${chunkIndex}`,
      docId: doc.id,
      chunkIndex,
      title: doc.title,
      text: words.slice(start, end).join(" "),
      status: doc.status,
      version: doc.version,
      effectiveDate: doc.effectiveDate,
    });
    if (end === words.length) break;
  }
  return chunks;
}
