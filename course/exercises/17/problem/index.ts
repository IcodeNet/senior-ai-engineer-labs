import { SEARCH_API, type Http } from "./azure.ts";

export interface IndexField {
  name: string;
  type: string;
  key?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  retrievable?: boolean;
  dimensions?: number;
  vectorSearchProfile?: string;
}

export interface IndexDefinition {
  name: string;
  fields: IndexField[];
  vectorSearch: {
    algorithms: { name: string; kind: string; hnswParameters: { metric: string; m: number; efConstruction: number; efSearch: number } }[];
    profiles: { name: string; algorithm: string }[];
  };
  semantic: {
    configurations: { name: string; prioritizedFields: { titleField: { fieldName: string }; prioritizedContentFields: { fieldName: string }[] } }[];
  };
}

export function indexDefinition(name: string, dimensions: number): IndexDefinition {
  // TODO: key, filterable governance fields, a cosine HNSW vector field and a default semantic configuration.
  throw new Error("Not implemented: indexDefinition");
}

export async function createOrUpdateIndex(http: Http, endpoint: string, definition: IndexDefinition): Promise<unknown> {
  // TODO: PUT the definition to /indexes/<name>; accept 200 or 201; include Azure's error message otherwise.
  throw new Error("Not implemented: createOrUpdateIndex");
}
