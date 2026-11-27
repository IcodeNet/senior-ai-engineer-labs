export type PiiType = "email" | "card" | "iban" | "nino";

export interface PiiSpan {
  type: PiiType;
  start: number;
  end: number;
  value: string;
}

export interface Redaction {
  text: string;
  /** Placeholder → original value. Keep server-side only; never log or send it to the model. */
  mapping: Record<string, string>;
  counts: Record<PiiType, number>;
}

const PATTERNS: { type: PiiType; pattern: RegExp; valid?: (value: string) => boolean }[] = [
  { type: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  { type: "iban", pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b/g, valid: (v) => ibanValid(v) },
  { type: "nino", pattern: /\b[A-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g },
];

/**
 * Every digit window of 13–19 digits that starts and ends on a digit-group boundary inside a run of
 * digits separated by single spaces or dashes. "Ref 12 4111 1111 1111 1111" yields windows starting
 * at "12" and at "4111", so a card next to other digits is still found.
 */
export function cardCandidates(text: string): { start: number; end: number; value: string }[] {
  const candidates: { start: number; end: number; value: string }[] = [];
  for (const run of text.matchAll(/\b\d(?:[ -]?\d)*\b/g)) {
    const digits: number[] = [];
    for (let i = 0; i < run[0].length; i++) if (/\d/.test(run[0][i])) digits.push(i);
    const startsGroup = (k: number) => k === 0 || digits[k - 1] !== digits[k] - 1;
    const endsGroup = (k: number) => k === digits.length - 1 || digits[k + 1] !== digits[k] + 1;
    for (let first = 0; first < digits.length; first++) {
      if (!startsGroup(first)) continue;
      for (let last = first + 12; last < Math.min(digits.length, first + 19); last++) {
        if (!endsGroup(last)) continue;
        const start = run.index + digits[first];
        const end = run.index + digits[last] + 1;
        candidates.push({ start, end, value: text.slice(start, end) });
      }
    }
  }
  return candidates;
}

export function luhnValid(value: string): boolean {
  const digits = value.replace(/[ -]/g, "");
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function ibanValid(value: string): boolean {
  const iban = value.replace(/ /g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function detectPii(text: string): PiiSpan[] {
  const found: PiiSpan[] = [];
  for (const { type, pattern, valid } of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (valid && !valid(match[0])) continue;
      found.push({ type, start: match.index, end: match.index + match[0].length, value: match[0] });
    }
  }
  for (const candidate of cardCandidates(text)) if (luhnValid(candidate.value)) found.push({ type: "card", ...candidate });
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept: PiiSpan[] = [];
  for (const span of found) if (kept.length === 0 || span.start >= kept[kept.length - 1].end) kept.push(span);
  return kept;
}

export function redact(text: string): Redaction {
  const counts: Record<PiiType, number> = { email: 0, card: 0, iban: 0, nino: 0 };
  const mapping: Record<string, string> = {};
  const byValue = new Map<string, string>();
  let output = "";
  let cursor = 0;
  for (const span of detectPii(text)) {
    let placeholder = byValue.get(`${span.type}:${span.value}`);
    if (!placeholder) {
      counts[span.type] += 1;
      placeholder = `[${span.type.toUpperCase()}_${counts[span.type]}]`;
      byValue.set(`${span.type}:${span.value}`, placeholder);
      mapping[placeholder] = span.value;
    }
    output += text.slice(cursor, span.start) + placeholder;
    cursor = span.end;
  }
  return { text: output + text.slice(cursor), mapping, counts };
}

export function restore(text: string, mapping: Record<string, string>): string {
  return text.replace(/\[(?:EMAIL|CARD|IBAN|NINO)_\d+\]/g, (placeholder) => mapping[placeholder] ?? placeholder);
}
