import { SEARCH_API, azureMessage, type Http } from "./azure.ts";

export type Sku = "free" | "basic" | "standard" | "standard2" | "standard3" | "storage_optimized_l1" | "storage_optimized_l2";

/** The parts of a `Microsoft.Search/searchServices` resource that decide cost and access, as Bicep or ARM declares them. */
export interface SearchServiceSpec {
  sku: Sku;
  replicaCount: number;
  partitionCount: number;
  semanticSearch: "free" | "standard";
  disableLocalAuth: boolean;
  identity: "SystemAssigned" | "None";
  tags: Record<string, string>;
}

export interface Finding {
  rule: "free-tier" | "local-auth" | "identity" | "semantic-billing" | "tags" | "capacity";
  message: string;
}

export interface Usage {
  used: number;
  quota: number | null;
}
export interface ServiceUsage {
  indexes: Usage;
  indexers: Usage;
  dataSources: Usage;
  storageBytes: Usage;
  vectorIndexBytes: Usage;
}

const PARTITIONS = [1, 2, 3, 4, 6, 12];
const REQUIRED_TAGS = ["course", "owner", "expiresAt"];

/** Search units are replicas × partitions. Partitions come in 1, 2, 3, 4, 6 or 12; Basic allows up to 3 replicas. */
export function searchUnits(spec: Pick<SearchServiceSpec, "sku" | "replicaCount" | "partitionCount">): number {
  // TODO: replicas × partitions; validate partitions (1, 2, 3, 4, 6, 12), replicas 1–12, Basic at most 3 replicas, Free is 0 units and cannot scale.
  throw new Error("Not implemented: searchUnits");
}

/** Hourly and 30-day cost of a dedicated service at a list price per search unit hour, rounded to the cent. */
export function serviceCost(spec: SearchServiceSpec, unitHourPrice: number): { units: number; hourly: number; thirtyDays: number } {
  // TODO: units × price per hour, and × 24 × 30; round to the cent; reject a negative or non-finite price.
  throw new Error("Not implemented: serviceCost");
}

/** Review a search service definition against the course's rules: keyless, identity for indexers, one unit, tagged, no surprise billing. */
export function reviewSearchService(spec: SearchServiceSpec): Finding[] {
  // TODO: one finding per broken rule: free-tier, local-auth, identity, semantic-billing, tags, capacity.
  throw new Error("Not implemented: reviewSearchService");
}

/** GET /servicestats: what the service holds against its tier's limits. */
export async function serviceUsage(http: Http, endpoint: string): Promise<ServiceUsage> {
  // TODO: GET /servicestats with audience search; map the counters to { used, quota }; throw on a non-200 or a missing counter.
  throw new Error("Not implemented: serviceUsage");
}
