import { effectiveAttributes, isVector, type Field } from "./schema.ts";
import { tokenizeFilter, type Token } from "./odata.ts";

export type QueryType = "simple" | "full";
/** Two schema designs for approval: a Boolean `approved` field, or a lifecycle `status` string. */
export type ApprovalDesign = "approved" | "status";

export interface FilterProblem {
  rule: "syntax" | "unknown-field" | "not-filterable" | "type-mismatch";
  message: string;
}

/** An OData string literal: single quotes, with any embedded quote doubled. */
export function escapeODataString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** The filter that keeps drafts, retired and out-of-date answers out of every query. `asOf` is YYYY-MM-DD. */
export function governanceFilter(design: ApprovalDesign, asOf: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || Number.isNaN(Date.parse(`${asOf}T00:00:00Z`))) throw new Error(`asOf must be YYYY-MM-DD: ${asOf}`);
  const at = `${asOf}T00:00:00Z`;
  const approval = design === "approved" ? "approved eq true" : "status eq 'approved'";
  return `${approval} and effectiveDate le ${at} and (expiryDate eq null or expiryDate ge ${at})`;
}

/** Combine the server's governance filter with an optional caller filter, so that no caller filter can widen it. */
export function withGovernance(callerFilter: string | undefined, design: ApprovalDesign, asOf: string): string {
  const governance = governanceFilter(design, asOf);
  if (callerFilter === undefined || callerFilter.trim() === "") return governance;
  return `(${governance}) and (${callerFilter})`;
}

/** The parser a search string needs. Prefix queries such as chem* work in both; full Lucene is needed for the rest. */
export function requiredQueryType(search: string): QueryType {
  const unescaped = search.replace(/\\./g, "x");
  if (/"[^"]*"~\d*/.test(unescaped)) return "full"; // proximity
  const withoutPhrases = unescaped.replace(/"[^"]*"/g, " ");
  if (/(^|[\s(])\/[^/]*\/(?=$|[\s)])/.test(withoutPhrases)) return "full"; // regular expression
  for (const raw of withoutPhrases.split(/[\s()|+]+/).filter(Boolean)) {
    const term = raw.replace(/^-+/, "");
    if (/^(AND|OR|NOT)$/.test(term) || term.startsWith("!")) return "full"; // text operators; ! is NOT in full syntax
    if (/^[A-Za-z_][\w/]*:/.test(term)) return "full"; // fielded search
    if (/~\d*$/.test(term) || term.includes("^")) return "full"; // fuzzy or term boost
    if (term.includes("?")) return "full"; // single-character wildcard
    const star = term.indexOf("*");
    if (star !== -1 && star !== term.length - 1) return "full"; // infix or leading wildcard
  }
  return "simple";
}

/**
 * Prefix, wildcard and regex terms skip the analyzer and match the literal (usually lower-case) tokens in the index,
 * so lower-case them in the application. Phrases, escaped characters, ordinary terms and AND/OR/NOT are left alone.
 */
export function lowercasePartialTerms(search: string): string {
  return search.replace(/"[^"]*"|\\.|\/[^/]*\/|[^\s()"]+/g, (token) => {
    if (token.startsWith('"') || token.startsWith("\\")) return token;
    if (token.startsWith("/") && token.endsWith("/") && token.length > 1) return token.toLowerCase();
    if (!/[*?]/.test(token.replace(/\\./g, ""))) return token;
    const field = /^[A-Za-z_][\w/]*:/.exec(token)?.[0] ?? ""; // field names are case-sensitive: keep them
    return field + token.slice(field.length).toLowerCase();
  });
}

const LITERALS: Record<string, string[]> = {
  "Edm.String": ["string"],
  "Edm.Boolean": ["boolean"],
  "Edm.Int32": ["number"],
  "Edm.Int64": ["number"],
  "Edm.Double": ["number"],
  "Edm.DateTimeOffset": ["datetime"],
};

/** Check a filter against the schema the way the service would: syntax, field existence, filterability and literal types. */
export function validateFilter(filter: string, fields: Field[]): FilterProblem[] {
  let tokens: Token[];
  try {
    tokens = tokenizeFilter(filter);
  } catch (error) {
    return [{ rule: "syntax", message: (error as Error).message }];
  }
  const problems: FilterProblem[] = [];
  const byName = new Map(fields.map((f) => [f.name, f]));
  let i = 0;
  const peek = () => tokens[i];
  const fail = (message: string): never => {
    throw new Error(`syntax: ${message}`);
  };

  const checkField = (name: string): Field | undefined => {
    const field = byName.get(name);
    if (!field) {
      problems.push({ rule: "unknown-field", message: `${name} is not a field in the index` });
      return undefined;
    }
    if (isVector(field.type) || !effectiveAttributes(field).filterable) {
      problems.push({ rule: "not-filterable", message: `${name} is not filterable` });
      return undefined;
    }
    return field;
  };

  const comparison = () => {
    const name = peek();
    if (name?.kind !== "field") fail(`expected a field, found ${name ? `'${name.value}'` : "the end"}`);
    i++;
    const op = peek();
    if (op?.kind !== "op") {
      // A bare field is a valid Boolean expression only for Edm.Boolean fields.
      const field = checkField(name.value);
      if (field && field.type !== "Edm.Boolean")
        problems.push({ rule: "type-mismatch", message: `${name.value} is ${field.type}; only a Boolean field can stand alone` });
      return;
    }
    i++;
    const literal = peek();
    if (!literal || !["string", "number", "boolean", "null", "datetime"].includes(literal.kind)) fail(`expected a literal after ${op.value}`);
    i++;
    const field = checkField(name.value);
    if (!field || literal.kind === "null") return;
    const allowed = LITERALS[field.type];
    if (!allowed) {
      problems.push({ rule: "type-mismatch", message: `${name.value} is ${field.type}; collections need any/all, outside this subset` });
      return;
    }
    if (!allowed.includes(literal.kind))
      problems.push({ rule: "type-mismatch", message: `${name.value} is ${field.type} but is compared with a ${literal.kind} literal (${literal.value})` });
    else if (field.type === "Edm.Boolean" && op.value !== "eq" && op.value !== "ne")
      problems.push({ rule: "type-mismatch", message: `${name.value} is Edm.Boolean: use eq or ne` });
  };

  const factor = (): void => {
    const token = peek();
    if (token?.kind === "not") {
      i++;
      const next = tokens[i + 1];
      if (peek()?.kind === "field" && next?.kind === "op") fail("not binds tighter than comparisons: write not (field op value)");
      factor();
      return;
    }
    if (token?.kind === "lparen") {
      i++;
      expression();
      if (peek()?.kind !== "rparen") fail("missing ')'");
      i++;
      return;
    }
    comparison();
  };
  const conjunction = () => {
    factor();
    while (peek()?.kind === "and") {
      i++;
      factor();
    }
  };
  const expression = (): void => {
    conjunction();
    while (peek()?.kind === "or") {
      i++;
      conjunction();
    }
  };

  try {
    if (tokens.length === 0) fail("empty filter");
    expression();
    if (i < tokens.length) fail(`unexpected '${tokens[i].value}'`);
  } catch (error) {
    return [{ rule: "syntax", message: (error as Error).message }];
  }
  return problems;
}
