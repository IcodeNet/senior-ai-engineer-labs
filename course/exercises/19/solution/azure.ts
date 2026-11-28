// Shared helper for the live Azure steps. You do not need to change this file.
// Live tests run only after the "Set up Azure" action (`npm run azure:up`) has written course/.azure/env.json.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Audience = "search" | "openai" | "storage";

export interface HttpRequest {
  method: "GET" | "PUT" | "POST" | "DELETE";
  url: string;
  /** JSON-serialised unless it is already a string. */
  body?: unknown;
  audience: Audience;
  headers?: Record<string, string>;
}
export interface HttpResponse {
  status: number;
  body: any;
}
export type Http = (request: HttpRequest) => Promise<HttpResponse>;

/** What set-up writes to course/.azure/env.json (from the Bicep outputs and azure/config.json). */
export interface AzureEnv {
  searchEndpoint: string;
  openaiEndpoint: string;
  chatDeployment: string;
  embeddingDeployment: string;
  embeddingModel?: string;
  indexName: string;
  dimensions: number;
  storageAccountId?: string;
  blobEndpoint?: string;
  storageContainer?: string;
}

/** Azure AI Search data-plane REST API version: the stable version used throughout Microsoft Learn's REST examples (checked 2026-11-28). */
export const SEARCH_API = "2026-10-01";
/** Azure Storage service version for Blob REST calls. Microsoft Entra ID tokens need 2017-11-09 or later. */
export const STORAGE_API = "2023-11-03";

export function loadAzureEnv(start = process.cwd()): AzureEnv | undefined {
  for (let dir = start; ; dir = dirname(dir)) {
    const file = join(dir, ".azure", "env.json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as AzureEnv;
    if (dirname(dir) === dir) return undefined;
  }
}

/** Set when Azure resources exist and live tests are enabled (ICODE_AZURE_LIVE=0 disables them). */
export const live: AzureEnv | undefined = process.env.ICODE_AZURE_LIVE === "0" ? undefined : loadAzureEnv();
/** Set when the live environment also has the Blob storage the indexer steps need. */
export const liveStorage: Required<AzureEnv> | undefined =
  live?.blobEndpoint && live.storageAccountId && live.storageContainer ? ({ embeddingModel: "text-embedding-3-small", ...live } as Required<AzureEnv>) : undefined;

const RESOURCES: Record<Audience, string> = {
  search: "https://search.azure.com",
  openai: "https://cognitiveservices.azure.com",
  storage: "https://storage.azure.com",
};
const tokens = new Map<string, { value: string; expires: number }>();
function token(audience: Audience): string {
  const resource = RESOURCES[audience];
  const cached = tokens.get(resource);
  if (cached && cached.expires > Date.now() + 60_000) return cached.value;
  const raw = execFileSync("az", ["account", "get-access-token", "--resource", resource, "-o", "json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const parsed = JSON.parse(raw) as { accessToken: string; expires_on?: number };
  const value = { value: parsed.accessToken, expires: (parsed.expires_on ?? Date.now() / 1000 + 600) * 1000 };
  tokens.set(resource, value);
  return value.value;
}

/** Real HTTP transport: Microsoft Entra ID tokens from the Azure CLI, no keys. */
export const azureHttp: Http = async ({ method, url, body, audience, headers }) => {
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token(audience)}`, "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
};

/** Test double: records every request and answers with `handler`. */
export function fakeHttp(handler: (request: HttpRequest) => HttpResponse | Promise<HttpResponse>) {
  const requests: HttpRequest[] = [];
  const http: Http = async (request) => {
    requests.push(request);
    return handler(request);
  };
  return { http, requests };
}

export const fakeEnv: Required<AzureEnv> = {
  searchEndpoint: "https://srch-test.search.windows.net",
  openaiEndpoint: "https://oai-test.openai.azure.com/",
  chatDeployment: "chat",
  embeddingDeployment: "embed",
  embeddingModel: "text-embedding-3-small",
  indexName: "northbank-faq-v1",
  dimensions: 4,
  storageAccountId: "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-test/providers/Microsoft.Storage/storageAccounts/sttest",
  blobEndpoint: "https://sttest.blob.core.windows.net/",
  storageContainer: "northbank-faq",
};

/** The error message Azure puts in a failed response body, if any. */
export function azureMessage(response: HttpResponse): string {
  return String(response.body?.error?.message ?? "").trim();
}
