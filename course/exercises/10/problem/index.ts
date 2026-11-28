/** The subset of Azure AI Search EDM types this course models. */
export type EdmType =
  | "Edm.String"
  | "Collection(Edm.String)"
  | "Edm.Boolean"
  | "Edm.Int32"
  | "Edm.Int64"
  | "Edm.Double"
  | "Edm.DateTimeOffset"
  | "Collection(Edm.Single)";

export const SUPPORTED_TYPES: readonly string[] = [
  "Edm.String",
  "Collection(Edm.String)",
  "Edm.Boolean",
  "Edm.Int32",
  "Edm.Int64",
  "Edm.Double",
  "Edm.DateTimeOffset",
  "Collection(Edm.Single)",
];

/** A field as it appears in the `fields` array of a Create Index request body. */
export interface Field {
  name: string;
  type: EdmType | string;
  key?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  retrievable?: boolean;
  sortable?: boolean;
  facetable?: boolean;
  analyzer?: string;
  dimensions?: number;
  vectorSearchProfile?: string;
}

export interface IndexDefinition {
  name: string;
  description?: string;
  fields: Field[];
  vectorSearch?: {
    algorithms: { name: string; kind: string }[];
    profiles: { name: string; algorithm: string }[];
  };
}

export type Attributes = Required<Pick<Field, "searchable" | "filterable" | "retrievable" | "sortable" | "facetable">>;

export interface Problem {
  /** "index" or "fields.<name>". */
  path: string;
  rule:
    | "index-name"
    | "field-name"
    | "duplicate-field"
    | "unsupported-type"
    | "key-count"
    | "key-type"
    | "key-retrievable"
    | "searchable-type"
    | "sortable-type"
    | "analyzer-target"
    | "vector-searchable"
    | "vector-attributes"
    | "vector-dimensions"
    | "vector-profile"
    | "dimensions-target";
  message: string;
}

export const isVector = (type: string) => type === "Collection(Edm.Single)";
const isText = (type: string) => type === "Edm.String" || type === "Collection(Edm.String)";
const isCollection = (type: string) => type.startsWith("Collection(");

/**
 * The attributes a field ends up with when you send it to the REST API. REST turns most attributes on by default where the
 * type allows them; vector fields default to not retrievable. The .NET SDK does the opposite and defaults them off,
 * which is one reason to set every attribute explicitly.
 */
export function effectiveAttributes(field: Field): Attributes {
  // TODO: apply the REST defaults: non-vector fields default filterable, retrievable and facetable; searchable only for string types; sortable unless a collection. Vector fields default searchable, everything else false.
  throw new Error("Not implemented: effectiveAttributes");
}

const INDEX_NAME = /^[a-z0-9][a-z0-9_-]{1,127}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;

export function validateIndex(definition: IndexDefinition): Problem[] {
  // TODO: report index-level problems first (index-name, key-count), then each field in order, using the rule names in Problem. Use effectiveAttributes, not the raw flags.
  throw new Error("Not implemented: validateIndex");
}
