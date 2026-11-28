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
  const explicit = field[attribute];
  if (explicit !== undefined) return explicit;
  if (isVector(field.type)) return attribute === "searchable";
  if (attribute === "searchable") return field.type === "Edm.String" || field.type === "Collection(Edm.String)";
  if (attribute === "sortable") return !field.type.startsWith("Collection(");
  return true;
}

/** What differs between the index on the service and the one you want, field by field. */
export function diffIndex(existing: IndexDefinition, desired: IndexDefinition): Change[] {
  const changes: Change[] = [];
  const before = new Map(existing.fields.map((f) => [f.name, f]));
  const after = new Map(desired.fields.map((f) => [f.name, f]));
  for (const name of before.keys()) if (!after.has(name)) changes.push({ kind: "remove-field", field: name, detail: `${name} is removed` });
  for (const [name, want] of after) {
    const have = before.get(name);
    if (!have) {
      changes.push({ kind: "add-field", field: name, detail: `${name} is added` });
      continue;
    }
    if (have.type !== want.type) changes.push({ kind: "change-type", field: name, detail: `${name} type ${have.type} → ${want.type}` });
    if (Boolean(have.key) !== Boolean(want.key)) changes.push({ kind: "change-key", field: name, detail: `${name} key ${Boolean(have.key)} → ${Boolean(want.key)}` });
    for (const attribute of INDEXED)
      if (effective(have, attribute) !== effective(want, attribute))
        changes.push({ kind: "change-attribute", field: name, detail: `${name} ${attribute} ${effective(have, attribute)} → ${effective(want, attribute)}` });
    if (effective(have, "retrievable") !== effective(want, "retrievable"))
      changes.push({ kind: "change-retrievable", field: name, detail: `${name} retrievable ${effective(have, "retrievable")} → ${effective(want, "retrievable")}` });
    if ((have.analyzer ?? null) !== (want.analyzer ?? null))
      changes.push({ kind: "change-analyzer", field: name, detail: `${name} analyzer ${have.analyzer ?? "default"} → ${want.analyzer ?? "default"}` });
    if (isVector(want.type) && isVector(have.type)) {
      if (have.dimensions !== want.dimensions) changes.push({ kind: "change-dimensions", field: name, detail: `${name} dimensions ${have.dimensions} → ${want.dimensions}` });
      if (have.vectorSearchProfile !== want.vectorSearchProfile)
        changes.push({ kind: "change-vector-profile", field: name, detail: `${name} profile ${have.vectorSearchProfile} → ${want.vectorSearchProfile}` });
    }
  }
  if ((existing.description ?? "") !== (desired.description ?? "")) changes.push({ kind: "change-description", detail: "description changes" });
  return changes;
}

/** Create, leave alone, update in place, or refuse because the change needs a rebuild. */
export function planDeployment(existing: IndexDefinition | undefined, desired: IndexDefinition): Plan {
  if (!existing) return { action: "create", changes: [], rebuildReasons: [] };
  const changes = diffIndex(existing, desired);
  const rebuildReasons = changes.filter((c) => REBUILD.has(c.kind)).map((c) => c.detail);
  const action = rebuildReasons.length ? "rebuild" : changes.length ? "update" : "none";
  return { action, changes, rebuildReasons };
}

/** northbank-faq-v1 → northbank-faq-v2; a name without a version gets -v2. */
export function nextVersion(name: string): string {
  const match = /^(.*)-v(\d+)$/.exec(name);
  return match ? `${match[1]}-v${Number(match[2]) + 1}` : `${name}-v2`;
}

const indexUrl = (endpoint: string, name: string) => `${endpoint}/indexes/${encodeURIComponent(name)}?api-version=${SEARCH_API}`;

/** GET the index definition, or undefined when it does not exist. */
export async function getIndex(http: Http, endpoint: string, name: string): Promise<IndexDefinition | undefined> {
  const response = await http({ method: "GET", url: indexUrl(endpoint, name), audience: "search" });
  if (response.status === 404) return undefined;
  if (response.status !== 200) throw new Error(`get index failed: ${response.status} ${azureMessage(response)}`.trim());
  return response.body as IndexDefinition;
}

/** Deploy safely: PUT only for create or update; never drop an index to apply a change. */
export async function deployIndex(http: Http, endpoint: string, desired: IndexDefinition): Promise<Plan> {
  const plan = planDeployment(await getIndex(http, endpoint, desired.name), desired);
  if (plan.action === "rebuild")
    throw new Error(`rebuild required for ${desired.name}: ${plan.rebuildReasons.join("; ")}. Create ${nextVersion(desired.name)}, load it, then point an alias at it`);
  if (plan.action === "none") return plan;
  const response = await http({ method: "PUT", url: indexUrl(endpoint, desired.name), body: desired, audience: "search" });
  if (response.status !== 200 && response.status !== 201) throw new Error(`create or update index failed: ${response.status} ${azureMessage(response)}`.trim());
  return plan;
}
