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
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

export function contentTerms(text: string): string[] {
  return text
    .replace(/\[S\d+\]/g, " ")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => (term.length >= 3 || /\d/.test(term)) && !STOPWORDS.has(term));
}

export function assessGroundedness(answer: string, sources: SourceText[], minOverlap = 0.5): Groundedness {
  const byLabel = new Map(sources.map((source) => [source.label, source]));
  const sentences = splitSentences(answer).map((text): SentenceCheck => {
    const citations = [...new Set([...text.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]))];
    const fail = (reason: Reason): SentenceCheck => ({ text, citations, supported: false, reason });
    if (citations.length === 0) return fail("uncited");
    if (citations.some((label) => !byLabel.has(label))) return fail("unknown-source");
    const evidence = new Set(citations.flatMap((label) => contentTerms(byLabel.get(label)!.text)));
    const terms = contentTerms(text);
    if (terms.some((term) => /\d/.test(term) && !evidence.has(term))) return fail("unsupported-number");
    const overlap = terms.length === 0 ? 1 : terms.filter((term) => evidence.has(term)).length / terms.length;
    if (overlap < minOverlap) return fail("low-overlap");
    return { text, citations, supported: true };
  });
  const rate = (count: number) => (sentences.length === 0 ? 0 : count / sentences.length);
  return {
    sentences,
    citationCoverage: rate(sentences.filter((s) => s.citations.length > 0).length),
    supportedRate: rate(sentences.filter((s) => s.supported).length),
  };
}
