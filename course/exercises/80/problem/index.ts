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
  // TODO: strip spaces and dashes, require 13-19 digits, then apply the Luhn checksum.
  throw new Error("Not implemented: luhnValid");
}

export function ibanValid(value: string): boolean {
  // TODO: move the first four characters to the end, letters to numbers (A=10), remainder mod 97 must be 1.
  throw new Error("Not implemented: ibanValid");
}

export function detectPii(text: string): PiiSpan[] {
  // TODO: PATTERNS matches that pass validation plus Luhn-valid cardCandidates; sort by start (longest first) and drop overlaps.
  throw new Error("Not implemented: detectPii");
}

export function redact(text: string): Redaction {
  // TODO: replace each span with [TYPE_n], one placeholder per distinct value, and return the mapping and counts.
  throw new Error("Not implemented: redact");
}

export function restore(text: string, mapping: Record<string, string>): string {
  // TODO: replace known placeholders with their original values; leave unknown ones.
  throw new Error("Not implemented: restore");
}
