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
  // TODO: wrap in single quotes and double every embedded single quote.
  throw new Error("Not implemented: escapeODataString");
}

/** The filter that keeps drafts, retired and out-of-date answers out of every query. `asOf` is YYYY-MM-DD. */
export function governanceFilter(design: ApprovalDesign, asOf: string): string {
  // TODO: approval clause for the design, then effectiveDate le <asOf>T00:00:00Z and (expiryDate eq null or expiryDate ge <asOf>T00:00:00Z); reject a malformed asOf.
  throw new Error("Not implemented: governanceFilter");
}

/** Combine the server's governance filter with an optional caller filter, so that no caller filter can widen it. */
export function withGovernance(callerFilter: string | undefined, design: ApprovalDesign, asOf: string): string {
  // TODO: governance alone when there is no caller filter; otherwise '(<governance>) and (<caller>)'.
  throw new Error("Not implemented: withGovernance");
}

/** The parser a search string needs. Prefix queries such as chem* work in both; full Lucene is needed for the rest. */
export function requiredQueryType(search: string): QueryType {
  // TODO: return 'full' for proximity, regex, AND/OR/NOT, a ! negation, field:term, ~, ^, ? and any * that is not at the end of a term; otherwise 'simple'. Ignore escaped characters and text inside phrases.
  throw new Error("Not implemented: requiredQueryType");
}

/**
 * Prefix, wildcard and regex terms skip the analyzer and match the literal (usually lower-case) tokens in the index,
 * so lower-case them in the application. Phrases, escaped characters, ordinary terms and AND/OR/NOT are left alone.
 */
export function lowercasePartialTerms(search: string): string {
  // TODO: lower-case prefix, wildcard and regex terms (keep any field: prefix); leave phrases, escapes, ordinary terms and operators alone.
  throw new Error("Not implemented: lowercasePartialTerms");
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
  // TODO: tokenize with tokenizeFilter, parse or > and > not > comparison, and report unknown, non-filterable and wrongly typed comparisons; any parse failure is a single 'syntax' problem.
  throw new Error("Not implemented: validateFilter");
}
