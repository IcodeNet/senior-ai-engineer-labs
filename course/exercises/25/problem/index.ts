import type { FaqDocument, LabelledQuestion } from "./documents.ts";

/** A chunk of a document body. start and end are offsets into the body; text is what gets embedded and indexed. */
export interface Chunk {
  text: string;
  start: number;
  end: number;
  /** Heading path for structure-aware chunks, for example ["Overdrafts explained", "Going past your limit"]. */
  headings?: string[];
}
export type Chunker = (body: string) => Chunk[];

export interface Comparison {
  strategy: string;
  chunks: number;
  meanLength: number;
  maxLength: number;
  /** Share of labelled answers that fall entirely inside one chunk of their document. */
  answersIntact: number;
  /** Characters indexed more than once because of overlap, as a share of the bodies' length. */
  duplication: number;
}

/** Fixed windows of `size` characters; each window starts `size - overlap` after the previous one. */
export function fixedChunks(body: string, size: number, overlap = 0): Chunk[] {
  // TODO: windows of size characters, each starting size - overlap after the last, the final one ending at the body end; overlap 0 ≤ overlap < size.
  throw new Error("Not implemented: fixedChunks");
}

/** Sentence spans: text up to and including . ! or ? (or a line break), without surrounding whitespace. */
export function sentences(body: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  const pattern = /[^.!?\n]+(?:[.!?]+|(?=\n)|$)/g;
  for (const match of body.matchAll(pattern)) {
    const lead = match[0].length - match[0].trimStart().length;
    const text = match[0].trim();
    if (!text) continue;
    const start = match.index! + lead;
    spans.push({ start, end: start + text.length });
  }
  return spans;
}

/**
 * Pack whole sentences into chunks of at most maxChars, repeating the last `overlapSentences` sentences at the start of
 * the next chunk. A sentence longer than maxChars becomes fixed windows on its own.
 */
export function sentenceChunks(body: string, maxChars: number, overlapSentences = 0): Chunk[] {
  // TODO: pack sentences() into chunks of at most maxChars; carry the last overlapSentences sentences into the next chunk (dropping carried ones that no longer fit); split an over-long sentence into fixed windows.
  throw new Error("Not implemented: sentenceChunks");
}

/**
 * Split Markdown at headings, keep each section whole when it fits, otherwise sentence-chunk it, and prefix every chunk
 * with its heading path so that a chunk read on its own still says what it is about.
 */
export function structureChunks(body: string, maxChars: number): Chunk[] {
  // TODO: split at Markdown headings, track the heading path, keep a section whole if prefix + content fits, else sentence-chunk it; prefix each chunk with "A > B\n"; offsets point into the body.
  throw new Error("Not implemented: structureChunks");
}

/** Compare chunkers on whole documents: size, how often a labelled answer survives in one chunk, and overlap cost. */
export function compareChunkers(documents: FaqDocument[], questions: LabelledQuestion[], strategies: Record<string, Chunker>): Comparison[] {
  // TODO: per strategy: chunk every body, count chunks, mean and max text length, share of answers inside one chunk (by offsets), and duplicated characters as a share of total length (two decimals).
  throw new Error("Not implemented: compareChunkers");
}
