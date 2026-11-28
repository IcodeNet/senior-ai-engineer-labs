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
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive integer");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= size) throw new RangeError("overlap must be at least 0 and less than size");
  const chunks: Chunk[] = [];
  for (let start = 0; start < body.length; start += size - overlap) {
    const end = Math.min(start + size, body.length);
    chunks.push({ text: body.slice(start, end), start, end });
    if (end === body.length) break;
  }
  return chunks;
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
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError("maxChars must be a positive integer");
  if (!Number.isInteger(overlapSentences) || overlapSentences < 0) throw new RangeError("overlapSentences must be a non-negative integer");
  const chunks: Chunk[] = [];
  const emit = (group: { start: number; end: number }[]) => {
    const start = group[0].start;
    const end = group.at(-1)!.end;
    chunks.push({ text: body.slice(start, end), start, end });
  };
  let group: { start: number; end: number }[] = [];
  for (const span of sentences(body)) {
    if (span.end - span.start > maxChars) {
      if (group.length) emit(group);
      group = [];
      for (const piece of fixedChunks(body.slice(span.start, span.end), maxChars)) chunks.push({ text: piece.text, start: span.start + piece.start, end: span.start + piece.end });
      continue;
    }
    if (group.length && span.end - group[0].start > maxChars) {
      emit(group);
      // Carry the last sentences into the next chunk, but never so many that the new sentence no longer fits.
      group = overlapSentences ? group.slice(-overlapSentences) : [];
      while (group.length && span.end - group[0].start > maxChars) group.shift();
    }
    group.push(span);
  }
  if (group.length) emit(group);
  return chunks;
}

/**
 * Split Markdown at headings, keep each section whole when it fits, otherwise sentence-chunk it, and prefix every chunk
 * with its heading path so that a chunk read on its own still says what it is about.
 */
export function structureChunks(body: string, maxChars: number): Chunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError("maxChars must be a positive integer");
  const headings: { level: number; text: string; start: number; end: number }[] = [];
  for (const match of body.matchAll(/^(#{1,6})[ \t]+(.+)$/gm)) headings.push({ level: match[1].length, text: match[2].trim(), start: match.index!, end: match.index! + match[0].length });
  const chunks: Chunk[] = [];
  const path: { level: number; text: string }[] = [];
  const sections = headings.length ? headings : [{ level: 0, text: "", start: 0, end: 0 }];
  if (headings.length && headings[0].start > 0) sections.unshift({ level: 0, text: "", start: 0, end: 0 });
  sections.forEach((heading, i) => {
    while (path.length && path.at(-1)!.level >= heading.level) path.pop();
    if (heading.text) path.push({ level: heading.level, text: heading.text });
    const sectionStart = heading.end;
    const sectionEnd = i + 1 < sections.length ? sections[i + 1].start : body.length;
    const raw = body.slice(sectionStart, sectionEnd);
    const lead = raw.length - raw.trimStart().length;
    const content = raw.trim();
    if (!content) return;
    const start = sectionStart + lead;
    const names = path.map((p) => p.text);
    const prefix = names.length ? `${names.join(" > ")}\n` : "";
    const pieces = content.length + prefix.length <= maxChars ? [{ text: content, start: 0, end: content.length }] : sentenceChunks(content, Math.max(1, maxChars - prefix.length));
    for (const piece of pieces) chunks.push({ text: prefix + piece.text, start: start + piece.start, end: start + piece.end, headings: names });
  });
  return chunks;
}

/** Compare chunkers on whole documents: size, how often a labelled answer survives in one chunk, and overlap cost. */
export function compareChunkers(documents: FaqDocument[], questions: LabelledQuestion[], strategies: Record<string, Chunker>): Comparison[] {
  const totalLength = documents.reduce((n, d) => n + d.body.length, 0);
  return Object.entries(strategies).map(([strategy, chunker]) => {
    const byDocument = new Map(documents.map((d) => [d.sourceUri, { body: d.body, chunks: chunker(d.body) }]));
    const all = [...byDocument.values()].flatMap((d) => d.chunks);
    const lengths = all.map((c) => c.text.length);
    const intact = questions.filter((q) => {
      const doc = byDocument.get(q.sourceUri);
      if (!doc) throw new Error(`no document for ${q.sourceUri}`);
      const at = doc.body.indexOf(q.answer);
      if (at === -1) throw new Error(`answer not found in ${q.sourceUri}: ${q.answer}`);
      return doc.chunks.some((c) => c.start <= at && at + q.answer.length <= c.end);
    }).length;
    const covered = all.reduce((n, c) => n + (c.end - c.start), 0);
    const round = (x: number) => Math.round(x * 100) / 100;
    return {
      strategy,
      chunks: all.length,
      meanLength: Math.round(lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length)),
      maxLength: Math.max(0, ...lengths),
      answersIntact: round(intact / Math.max(1, questions.length)),
      duplication: round(Math.max(0, covered - totalLength) / totalLength),
    };
  });
}
