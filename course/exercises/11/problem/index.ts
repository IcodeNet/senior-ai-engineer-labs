export interface SourceText {
  label: string;
  text: string;
}

export type Reason = "uncited" | "unknown-source" | "unsupported-number" | "low-overlap";

export interface SentenceCheck {
  text: string;
  citations: string[];
  supported: boolean;
  reason?: Reason;
}

export interface Groundedness {
  sentences: SentenceCheck[];
  citationCoverage: number;
  supportedRate: number;
}

export const STOPWORDS = new Set([
  "the", "and", "are", "for", "with", "that", "this", "these", "those", "from", "have", "has",
  "was", "were", "will", "you", "your", "our", "its", "into", "than", "then", "also", "can", "per",
]);

export function splitSentences(text: string): string[] {
  // TODO: split after . ! or ? followed by whitespace.
  throw new Error("Not implemented: splitSentences");
}

export function contentTerms(text: string): string[] {
  // TODO: drop [S<n>] markers, lower-case, keep 3+ character or numeric terms that are not stopwords.
  throw new Error("Not implemented: contentTerms");
}

export function assessGroundedness(answer: string, sources: SourceText[], minOverlap = 0.5): Groundedness {
  // TODO: per-sentence checks in order: uncited, unknown-source, unsupported-number, low-overlap.
  throw new Error("Not implemented: assessGroundedness");
}
