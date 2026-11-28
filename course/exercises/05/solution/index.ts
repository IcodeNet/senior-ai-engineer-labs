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
  return Math.ceil(text.length / 4);
}

/** Governance first: only approved answers that are in force on `today` (YYYY-MM-DD) may ever reach a prompt. */
export function eligible(faq: Faq, today: string): boolean {
  if (faq.status !== "approved") return false;
  if (faq.effectiveDate > today) return false;
  if (faq.expiryDate !== undefined && faq.expiryDate < today) return false;
  return true;
}

const words = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));

/** A deliberately naive retriever: score = number of distinct query words found in the title or text. */
export function overlapRetrieve(query: string, faqs: Faq[], k: number): Hit[] {
  const wanted = words(query);
  return faqs
    .map((faq) => {
      const have = words(`${faq.title} ${faq.text}`);
      let score = 0;
      for (const word of wanted) if (have.has(word)) score++;
      return { id: faq.id, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, k);
}

/** Fill the context budget in rank order; a passage that does not fit is skipped and smaller ones after it may still fit. */
export function packContext(ranked: { id: string; text: string }[], budget: number): Packed {
  const ids: string[] = [];
  let tokens = 0;
  for (const passage of ranked) {
    const cost = estimateTokens(passage.text);
    if (tokens + cost > budget) continue;
    ids.push(passage.id);
    tokens += cost;
  }
  return { ids, tokens };
}

/** Filter, then retrieve, then pack. Filtering after retrieval would let ineligible answers crowd out eligible ones. */
export function retrieveForPrompt(query: string, faqs: Faq[], today: string, k: number, budget: number): Packed {
  const candidates = faqs.filter((faq) => eligible(faq, today));
  const hits = overlapRetrieve(query, candidates, k);
  const byId = new Map(candidates.map((faq) => [faq.id, faq]));
  return packContext(
    hits.map((hit) => ({ id: hit.id, text: byId.get(hit.id)!.text })),
    budget,
  );
}
