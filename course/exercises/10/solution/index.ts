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
  if (isVector(field.type))
    return {
      searchable: field.searchable ?? true,
      filterable: field.filterable ?? false,
      retrievable: field.retrievable ?? false,
      sortable: field.sortable ?? false,
      facetable: field.facetable ?? false,
    };
  return {
    searchable: field.searchable ?? isText(field.type),
    filterable: field.filterable ?? true,
    retrievable: field.retrievable ?? true,
    sortable: field.sortable ?? !isCollection(field.type),
    facetable: field.facetable ?? true,
  };
}

const INDEX_NAME = /^[a-z0-9][a-z0-9_-]{1,127}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;

export function validateIndex(definition: IndexDefinition): Problem[] {
  const problems: Problem[] = [];
  const add = (path: string, rule: Problem["rule"], message: string) => problems.push({ path, rule, message });

  if (!INDEX_NAME.test(definition.name) || /--|__/.test(definition.name))
    add("index", "index-name", "index names are 2–128 lower-case letters, digits, dashes or underscores, start with a letter or digit, with no doubled dash or underscore");
  const keys = definition.fields.filter((f) => f.key === true);
  if (keys.length !== 1) add("index", "key-count", `an index needs exactly one key field, found ${keys.length}`);

  const seen = new Set<string>();
  const profiles = new Map((definition.vectorSearch?.profiles ?? []).map((p) => [p.name, p.algorithm]));
  const algorithms = new Set((definition.vectorSearch?.algorithms ?? []).map((a) => a.name));

  for (const field of definition.fields) {
    const path = `fields.${field.name}`;
    const attributes = effectiveAttributes(field);
    if (!FIELD_NAME.test(field.name) || field.name.startsWith("azureSearch"))
      add(path, "field-name", "field names start with a letter, use letters, digits or underscores (at most 128) and cannot begin with 'azureSearch'");
    if (seen.has(field.name)) add(path, "duplicate-field", `field ${field.name} is defined more than once`);
    seen.add(field.name);
    if (!SUPPORTED_TYPES.includes(field.type)) {
      add(path, "unsupported-type", `type ${field.type} is not modelled in this course`);
      continue;
    }
    if (field.key === true) {
      if (field.type !== "Edm.String") add(path, "key-type", "the key field must be Edm.String");
      if (!attributes.retrievable) add(path, "key-retrievable", "the key field must be retrievable");
    }
    if (isVector(field.type)) {
      if (!attributes.searchable) add(path, "vector-searchable", "vector fields must be searchable");
      if (attributes.filterable || attributes.sortable || attributes.facetable)
        add(path, "vector-attributes", "vector fields cannot be filterable, sortable or facetable");
      if (!Number.isInteger(field.dimensions) || (field.dimensions ?? 0) < 2)
        add(path, "vector-dimensions", "vector fields need integer dimensions of at least 2, equal to the embedding model's output size");
      const algorithm = field.vectorSearchProfile === undefined ? undefined : profiles.get(field.vectorSearchProfile);
      if (algorithm === undefined || !algorithms.has(algorithm))
        add(path, "vector-profile", "vector fields need a vectorSearchProfile that exists in vectorSearch.profiles and names a defined algorithm");
      if (field.analyzer !== undefined) add(path, "analyzer-target", "vector fields cannot have an analyzer");
      continue;
    }
    if (field.dimensions !== undefined || field.vectorSearchProfile !== undefined)
      add(path, "dimensions-target", "dimensions and vectorSearchProfile apply only to vector fields");
    if (attributes.searchable && !isText(field.type))
      add(path, "searchable-type", "only string and string-collection fields are full-text searchable");
    if (attributes.sortable && isCollection(field.type)) add(path, "sortable-type", "collection fields cannot be sortable");
    if (field.analyzer !== undefined && !(isText(field.type) && attributes.searchable))
      add(path, "analyzer-target", "an analyzer applies only to searchable string fields");
  }
  return problems;
}
