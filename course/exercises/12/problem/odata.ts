// A tokenizer for the subset of OData $filter syntax this lab uses. You do not need to change this file.
// Supported: field paths, eq ne gt ge lt le, and or not, parentheses, and literals: 'strings' (with '' for a quote),
// numbers, true, false, null and DateTimeOffset values such as 2026-11-28T00:00:00Z. Functions (search.in,
// search.ismatch, geo.distance) and any/all lambdas are real OData features that this subset rejects.

export type TokenKind = "lparen" | "rparen" | "and" | "or" | "not" | "op" | "field" | "string" | "number" | "boolean" | "null" | "datetime";

export interface Token {
  kind: TokenKind;
  value: string;
}

const OPS = new Set(["eq", "ne", "gt", "ge", "lt", "le"]);
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?(?:Z|[+-]\d{2}:\d{2})/;
const NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)*/;

export function tokenizeFilter(filter: string): Token[] {
  const tokens: Token[] = [];
  let rest = filter;
  while ((rest = rest.replace(/^\s+/, "")).length > 0) {
    if (rest[0] === "(" || rest[0] === ")") {
      tokens.push({ kind: rest[0] === "(" ? "lparen" : "rparen", value: rest[0] });
      rest = rest.slice(1);
      continue;
    }
    if (rest[0] === "'") {
      let i = 1;
      let value = "";
      for (;;) {
        if (i >= rest.length) throw new Error("syntax: unterminated string literal");
        if (rest[i] === "'") {
          if (rest[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          break;
        }
        value += rest[i++];
      }
      tokens.push({ kind: "string", value });
      rest = rest.slice(i + 1);
      continue;
    }
    const datetime = DATETIME.exec(rest);
    if (datetime) {
      tokens.push({ kind: "datetime", value: datetime[0] });
      rest = rest.slice(datetime[0].length);
      continue;
    }
    const number = NUMBER.exec(rest);
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      rest = rest.slice(number[0].length);
      continue;
    }
    const identifier = IDENTIFIER.exec(rest);
    if (identifier) {
      const word = identifier[0];
      rest = rest.slice(word.length);
      const keyword = ["and", "or", "not"].includes(word);
      if (rest.startsWith(".") || (!keyword && /^\s*\(/.test(rest))) throw new Error(`syntax: functions such as ${word}.… are outside this lab's subset`);
      if (word === "and" || word === "or" || word === "not") tokens.push({ kind: word, value: word });
      else if (OPS.has(word)) tokens.push({ kind: "op", value: word });
      else if (word === "true" || word === "false") tokens.push({ kind: "boolean", value: word });
      else if (word === "null") tokens.push({ kind: "null", value: word });
      else tokens.push({ kind: "field", value: word });
      continue;
    }
    throw new Error(`syntax: unexpected character '${rest[0]}'`);
  }
  return tokens;
}
