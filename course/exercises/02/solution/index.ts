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
  return chunk.status === "approved" && Date.parse(chunk.effectiveDate) <= now.getTime();
}

export function currentChunks(chunks: Chunk[], now: Date): Chunk[] {
  const eligible = chunks.filter((chunk) => isEligible(chunk, now));
  const latest = new Map<string, number>();
  for (const chunk of eligible)
    latest.set(chunk.docId, Math.max(latest.get(chunk.docId) ?? -Infinity, chunk.version));
  return eligible.filter((chunk) => chunk.version === latest.get(chunk.docId));
}

export class ChunkStore {
  #chunks: Chunk[] = [];

  upsert(chunks: Chunk[]): void {
    const replaced = new Set(chunks.map((chunk) => chunk.docId));
    this.#chunks = [...this.#chunks.filter((chunk) => !replaced.has(chunk.docId)), ...chunks];
  }

  revoke(docId: string): void {
    this.#chunks = this.#chunks.filter((chunk) => chunk.docId !== docId);
  }

  eligible(now: Date): Chunk[] {
    return currentChunks(this.#chunks, now);
  }
}
