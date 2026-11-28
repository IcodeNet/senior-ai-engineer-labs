import type { Faq } from "./corpus.ts";

export interface Hit {
  id: string;
  score: number;
}

export interface Packed {
  ids: string[];
  tokens: number;
}

/**
 * A rough token count: about four characters per token for English text. Real tokenizers differ by model and
 * language, so use the model's own tokenizer when the budget is tight. This is a planning estimate only.
 */
export function estimateTokens(text: string): number {
  // TODO: Math.ceil(characters / 4).
  throw new Error("Not implemented: estimateTokens");
}

/** Governance first: only approved answers that are in force on `today` (YYYY-MM-DD) may ever reach a prompt. */
export function eligible(faq: Faq, today: string): boolean {
  // TODO: approved, effectiveDate on or before today, and expiryDate (if any) on or after today. ISO dates compare as strings.
  throw new Error("Not implemented: eligible");
}

const words = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));

/** A deliberately naive retriever: score = number of distinct query words found in the title or text. */
export function overlapRetrieve(query: string, faqs: Faq[], k: number): Hit[] {
  // TODO: lower-case, split on non letters/digits, count distinct query words present in title + text; drop zero scores; sort by score then id; keep k.
  throw new Error("Not implemented: overlapRetrieve");
}

/** Fill the context budget in rank order; a passage that does not fit is skipped and smaller ones after it may still fit. */
export function packContext(ranked: { id: string; text: string }[], budget: number): Packed {
  // TODO: walk in rank order; skip a passage whose estimateTokens would exceed the budget, keep going.
  throw new Error("Not implemented: packContext");
}

/** Filter, then retrieve, then pack. Filtering after retrieval would let ineligible answers crowd out eligible ones. */
export function retrieveForPrompt(query: string, faqs: Faq[], today: string, k: number, budget: number): Packed {
  // TODO: filter with eligible first, then overlapRetrieve, then packContext.
  throw new Error("Not implemented: retrieveForPrompt");
}
