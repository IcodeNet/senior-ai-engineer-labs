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
  const { sku, replicaCount: r, partitionCount: p } = spec;
  if (sku === "free") {
    if (r !== 1 || p !== 1) throw new RangeError("the Free tier cannot be scaled");
    return 0;
  }
  if (!Number.isInteger(r) || r < 1 || r > 12) throw new RangeError(`replicaCount must be 1–12, got ${r}`);
  if (!PARTITIONS.includes(p)) throw new RangeError(`partitionCount must be one of ${PARTITIONS.join(", ")}, got ${p}`);
  if (sku === "basic" && r > 3) throw new RangeError("Basic allows at most 3 replicas");
  return r * p;
}

/** Hourly and 30-day cost of a dedicated service at a list price per search unit hour, rounded to the cent. */
export function serviceCost(spec: SearchServiceSpec, unitHourPrice: number): { units: number; hourly: number; thirtyDays: number } {
  if (!Number.isFinite(unitHourPrice) || unitHourPrice < 0) throw new RangeError("unitHourPrice must be a non-negative number");
  const units = searchUnits(spec);
  const round = (x: number) => Math.round(x * 100) / 100;
  return { units, hourly: round(units * unitHourPrice), thirtyDays: round(units * unitHourPrice * 24 * 30) };
}

/** Review a search service definition against the course's rules: keyless, identity for indexers, one unit, tagged, no surprise billing. */
export function reviewSearchService(spec: SearchServiceSpec): Finding[] {
  const findings: Finding[] = [];
  if (spec.sku === "free")
    findings.push({ rule: "free-tier", message: "Free has no managed identity, so a keyless indexer cannot read Blob storage; use Basic" });
  if (spec.disableLocalAuth !== true) findings.push({ rule: "local-auth", message: "set disableLocalAuth: true so only Microsoft Entra ID tokens are accepted" });
  if (spec.identity !== "SystemAssigned")
    findings.push({ rule: "identity", message: "give the service a system-assigned identity; indexers use it for Blob storage and Azure OpenAI" });
  if (spec.semanticSearch === "standard")
    findings.push({ rule: "semantic-billing", message: "the standard semantic ranker plan bills per request after the free allowance; the free plan fails instead" });
  const missing = REQUIRED_TAGS.filter((t) => !spec.tags[t]);
  if (missing.length) findings.push({ rule: "tags", message: `missing tags ${missing.join(", ")}: shutdown and verify find course resources by tag` });
  if (spec.sku !== "free" && searchUnits(spec) > 1)
    findings.push({ rule: "capacity", message: `${searchUnits(spec)} search units multiply the hourly charge; the course needs 1` });
  return findings;
}

/** GET /servicestats: what the service holds against its tier's limits. */
export async function serviceUsage(http: Http, endpoint: string): Promise<ServiceUsage> {
  const response = await http({ method: "GET", url: `${endpoint}/servicestats?api-version=${SEARCH_API}`, audience: "search" });
  if (response.status !== 200) throw new Error(`service statistics failed: ${response.status} ${azureMessage(response)}`.trim());
  const counters = response.body?.counters ?? {};
  const read = (name: string): Usage => {
    const counter = counters[name];
    if (!counter || typeof counter.usage !== "number") throw new Error(`service statistics has no ${name} counter`);
    return { used: counter.usage, quota: counter.quota ?? null };
  };
  return {
    indexes: read("indexesCount"),
    indexers: read("indexersCount"),
    dataSources: read("dataSourcesCount"),
    storageBytes: read("storageSize"),
    vectorIndexBytes: read("vectorIndexSize"),
  };
}
