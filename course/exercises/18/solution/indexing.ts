// Working code from step 17. You do not need to change this file.
import { SEARCH_API, type AzureEnv, type Http } from "./azure.ts";

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
  return {
    name,
    fields: [
      { name: "id", type: "Edm.String", key: true, filterable: true },
      { name: "docId", type: "Edm.String", filterable: true },
      { name: "title", type: "Edm.String", searchable: true },
      { name: "content", type: "Edm.String", searchable: true },
      { name: "status", type: "Edm.String", filterable: true },
      { name: "version", type: "Edm.Int32", filterable: true },
      { name: "isLatest", type: "Edm.Boolean", filterable: true },
      { name: "effectiveDate", type: "Edm.DateTimeOffset", filterable: true, sortable: true },
      { name: "contentVector", type: "Collection(Edm.Single)", searchable: true, retrievable: false, dimensions, vectorSearchProfile: "default" },
    ],
    vectorSearch: {
      algorithms: [{ name: "hnsw", kind: "hnsw", hnswParameters: { metric: "cosine", m: 4, efConstruction: 400, efSearch: 500 } }],
      profiles: [{ name: "default", algorithm: "hnsw" }],
    },
    semantic: {
      configurations: [
        { name: "default", prioritizedFields: { titleField: { fieldName: "title" }, prioritizedContentFields: [{ fieldName: "content" }] } },
      ],
    },
  };
}

export async function createOrUpdateIndex(http: Http, endpoint: string, definition: IndexDefinition): Promise<unknown> {
  const response = await http({
    method: "PUT",
    url: `${endpoint}/indexes/${encodeURIComponent(definition.name)}?api-version=${SEARCH_API}`,
    body: definition,
    audience: "search",
  });
  if (response.status !== 200 && response.status !== 201)
    throw new Error(`create index failed: ${response.status} ${response.body?.error?.message ?? ""}`.trim());
  return response.body;
}
