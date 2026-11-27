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
  { type: "card", pattern: /\b\d(?:[ -]?\d){12,18}\b/g, valid: (v) => luhnValid(v) },
  { type: "nino", pattern: /\b[A-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g },
];

export function luhnValid(value: string): boolean {
  // TODO: strip spaces and dashes, require 13-19 digits, then apply the Luhn checksum.
  throw new Error("Not implemented: luhnValid");
}

export function ibanValid(value: string): boolean {
  // TODO: move the first four characters to the end, letters to numbers (A=10), remainder mod 97 must be 1.
  throw new Error("Not implemented: ibanValid");
}

export function detectPii(text: string): PiiSpan[] {
  // TODO: run PATTERNS, drop matches that fail validation, sort by start (longest first) and drop overlaps.
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
