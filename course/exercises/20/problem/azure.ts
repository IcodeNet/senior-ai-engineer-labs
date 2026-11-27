// Shared helper for the real-Azure steps. You do not need to change this file.
// Live tests run only after `npm run azure:up` has written course/.azure/env.json.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface HttpRequest {
  method: "GET" | "PUT" | "POST" | "DELETE";
  url: string;
  body?: unknown;
  audience: "search" | "openai";
}
export interface HttpResponse {
  status: number;
  body: any;
}
export type Http = (request: HttpRequest) => Promise<HttpResponse>;

export interface AzureEnv {
  searchEndpoint: string;
  openaiEndpoint: string;
  chatDeployment: string;
  embeddingDeployment: string;
  indexName: string;
  dimensions: number;
}

/** Azure AI Search data-plane REST API version used throughout the course. */
export const SEARCH_API = "2024-07-01";

export function loadAzureEnv(start = process.cwd()): AzureEnv | undefined {
  for (let dir = start; ; dir = dirname(dir)) {
    const file = join(dir, ".azure", "env.json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as AzureEnv;
    if (dirname(dir) === dir) return undefined;
  }
}

/** Set when Azure resources exist and live tests are enabled (ICODE_AZURE_LIVE=0 disables them). */
export const live: AzureEnv | undefined = process.env.ICODE_AZURE_LIVE === "0" ? undefined : loadAzureEnv();

const tokens = new Map<string, { value: string; expires: number }>();
function token(audience: HttpRequest["audience"]): string {
  const resource = audience === "search" ? "https://search.azure.com" : "https://cognitiveservices.azure.com";
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
export const azureHttp: Http = async ({ method, url, body, audience }) => {
  const response = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token(audience)}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
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

export const fakeEnv: AzureEnv = {
  searchEndpoint: "https://srch-test.search.windows.net",
  openaiEndpoint: "https://oai-test.openai.azure.com/",
  chatDeployment: "chat",
  embeddingDeployment: "embed",
  indexName: "policies",
  dimensions: 4,
};
