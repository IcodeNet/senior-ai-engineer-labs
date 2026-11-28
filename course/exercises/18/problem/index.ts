import { SEARCH_API, azureMessage, type Http } from "./azure.ts";
import { isVector, type Field, type IndexDefinition } from "./northbank.ts";

export type ChangeKind =
  | "add-field"
  | "remove-field"
  | "change-type"
  | "change-key"
  | "change-attribute"
  | "change-retrievable"
  | "change-analyzer"
  | "change-dimensions"
  | "change-vector-profile"
  | "change-description";

export interface Change {
  kind: ChangeKind;
  field?: string;
  detail: string;
}

export interface Plan {
  action: "create" | "none" | "update" | "rebuild";
  changes: Change[];
  /** The changes that force a rebuild; empty unless action is "rebuild". */
  rebuildReasons: string[];
}

const REBUILD: ReadonlySet<ChangeKind> = new Set(["remove-field", "change-type", "change-key", "change-attribute", "change-analyzer", "change-dimensions", "change-vector-profile"]);
const INDEXED = ["searchable", "filterable", "sortable", "facetable"] as const;

/** The value Azure applies when an attribute is omitted in a REST request. */
export function effective(field: Field, attribute: "searchable" | "filterable" | "sortable" | "facetable" | "retrievable"): boolean {
  // TODO: the explicit value, or the REST default: vector fields are only searchable; strings are searchable; collections are not sortable; everything else defaults to true.
  throw new Error("Not implemented: effective");
}

/** What differs between the index on the service and the one you want, field by field. */
export function diffIndex(existing: IndexDefinition, desired: IndexDefinition): Change[] {
  // TODO: compare fields by name: added, removed, type, key, the four indexed attributes, retrievable, analyzer, and for vectors dimensions and profile; then the description.
  throw new Error("Not implemented: diffIndex");
}

/** Create, leave alone, update in place, or refuse because the change needs a rebuild. */
export function planDeployment(existing: IndexDefinition | undefined, desired: IndexDefinition): Plan {
  // TODO: create when nothing exists; otherwise none, update, or rebuild when any change is one Azure cannot apply in place.
  throw new Error("Not implemented: planDeployment");
}

/** northbank-faq-v1 → northbank-faq-v2; a name without a version gets -v2. */
export function nextVersion(name: string): string {
  // TODO: bump the -vN suffix, or add -v2.
  throw new Error("Not implemented: nextVersion");
}

const indexUrl = (endpoint: string, name: string) => `${endpoint}/indexes/${encodeURIComponent(name)}?api-version=${SEARCH_API}`;

/** GET the index definition, or undefined when it does not exist. */
export async function getIndex(http: Http, endpoint: string, name: string): Promise<IndexDefinition | undefined> {
  // TODO: GET /indexes/<name>; 404 means undefined; other non-200s throw get index failed: <status> <message>.
  throw new Error("Not implemented: getIndex");
}

/** Deploy safely: PUT only for create or update; never drop an index to apply a change. */
export async function deployIndex(http: Http, endpoint: string, desired: IndexDefinition): Promise<Plan> {
  // TODO: get, plan, throw on rebuild (name the next version and an alias), skip on none, otherwise PUT and accept 200 or 201.
  throw new Error("Not implemented: deployIndex");
}
