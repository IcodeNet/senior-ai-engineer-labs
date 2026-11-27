export type Status = "draft" | "approved" | "revoked";

export interface Chunk {
  id: string;
  docId: string;
  text: string;
  status: Status;
  version: number;
  effectiveDate: string;
}

export function isEligible(chunk: Chunk, now: Date): boolean {
  // TODO: approved and already effective at `now`.
  throw new Error("Not implemented: isEligible");
}

export function currentChunks(chunks: Chunk[], now: Date): Chunk[] {
  // TODO: eligible chunks, keeping only the highest eligible version per document.
  throw new Error("Not implemented: currentChunks");
}

export class ChunkStore {
  upsert(chunks: Chunk[]): void {
    // TODO: replace every stored chunk of the documents being upserted.
    throw new Error("Not implemented: ChunkStore.upsert");
  }

  revoke(docId: string): void {
    // TODO: remove every chunk of the document.
    throw new Error("Not implemented: ChunkStore.revoke");
  }

  eligible(now: Date): Chunk[] {
    // TODO: current, eligible chunks from the store.
    throw new Error("Not implemented: ChunkStore.eligible");
  }
}
