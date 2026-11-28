// Static contract tests for azure/main.bicep, run offline in `npm run test:tools`. CI also compiles the template with
// `az bicep build`; these tests pin the properties the course relies on for keyless access and for a complete teardown.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const course = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bicep = readFileSync(join(course, "azure/main.bicep"), "utf8");
const config = JSON.parse(readFileSync(join(course, "azure/config.json"), "utf8"));

/** Top-level `resource <symbol> '<type>@<version>' = { … }` blocks, keyed by symbol. */
const resources = Object.fromEntries(
  [...bicep.matchAll(/^resource (\w+) '([^@']+)@([^']+)' = \{([\s\S]*?)^\}/gm)].map(([, symbol, type, version, body]) => [symbol, { type, version, body }]),
);
const ofType = (type) => Object.entries(resources).filter(([, r]) => r.type === type);
const roleIds = Object.fromEntries([...bicep.matchAll(/^\s+(\w+): '([0-9a-f-]{36})'$/gm)].map(([, name, id]) => [name, id]));
const assignments = ofType("Microsoft.Authorization/roleAssignments").map(([symbol, r]) => ({
  symbol,
  scope: /scope: (\w+)/.exec(r.body)?.[1],
  principal: /principalId: ([\w.]+)/.exec(r.body)?.[1],
  role: /roles\.(\w+)\)/.exec(r.body)?.[1],
}));

describe("azure/main.bicep", () => {
  test("creates exactly the course's billable resources: search, Azure OpenAI and one storage account", () => {
    expect(ofType("Microsoft.Search/searchServices")).toHaveLength(1);
    expect(ofType("Microsoft.CognitiveServices/accounts")).toHaveLength(1);
    expect(ofType("Microsoft.Storage/storageAccounts")).toHaveLength(1);
  });

  test("every top-level resource that can bill carries the course tags, so the verify sweep finds it", () => {
    for (const type of ["Microsoft.Search/searchServices", "Microsoft.CognitiveServices/accounts", "Microsoft.Storage/storageAccounts"])
      for (const [symbol, r] of ofType(type)) expect(r.body, `${symbol} must be tagged`).toMatch(/^\s+tags: tags$/m);
  });

  test("keys are off everywhere: local auth disabled on search and Azure OpenAI, shared keys and anonymous blobs off", () => {
    for (const type of ["Microsoft.Search/searchServices", "Microsoft.CognitiveServices/accounts"])
      for (const [symbol, r] of ofType(type)) expect(r.body, symbol).toMatch(/disableLocalAuth: true/);
    const [, storage] = ofType("Microsoft.Storage/storageAccounts")[0];
    expect(storage.body).toMatch(/allowSharedKeyAccess: false/);
    expect(storage.body).toMatch(/allowBlobPublicAccess: false/);
    expect(storage.body).toMatch(/minimumTlsVersion: 'TLS1_2'/);
    expect(storage.body).toMatch(/kind: 'StorageV2'/);
    const [, container] = ofType("Microsoft.Storage/storageAccounts/blobServices/containers")[0];
    expect(container.body).toMatch(/publicAccess: 'None'/);
    expect(bicep).not.toMatch(/listKeys\(|AccountKey=|apiKey/);
  });

  test("search is Basic with a system-assigned identity and the semantic ranker on its free plan", () => {
    const [, search] = ofType("Microsoft.Search/searchServices")[0];
    expect(search.body).toMatch(/sku: \{ name: 'basic' \}/);
    expect(search.body).toMatch(/identity: \{ type: 'SystemAssigned' \}/);
    expect(search.body).toMatch(/semanticSearch: 'free'/);
    expect(search.body).toMatch(/replicaCount: 1/);
    expect(search.body).toMatch(/partitionCount: 1/);
  });

  test("role assignments: the learner can write blobs; the search identity can read blobs and call the embedding model", () => {
    expect(roleIds).toMatchObject({
      storageBlobDataReader: "2a2b9908-6ea1-4ae2-8e65-a410df84e7d1",
      storageBlobDataContributor: "ba92f5b4-2d11-453d-a403-e96b0029c9fe",
      cognitiveServicesOpenAIUser: "5e0bd9bd-7b93-4f28-af87-19fc36ad61bd",
    });
    expect(assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: "storage", principal: "principalId", role: "storageBlobDataContributor" }),
        expect.objectContaining({ scope: "storage", principal: "search.identity.principalId", role: "storageBlobDataReader" }),
        expect.objectContaining({ scope: "openai", principal: "search.identity.principalId", role: "cognitiveServicesOpenAIUser" }),
        expect.objectContaining({ scope: "search", principal: "principalId", role: "searchIndexDataContributor" }),
        expect.objectContaining({ scope: "search", principal: "principalId", role: "searchServiceContributor" }),
        expect.objectContaining({ scope: "openai", principal: "principalId", role: "cognitiveServicesOpenAIUser" }),
      ]),
    );
    // The search identity gets read-only storage access, never write.
    expect(assignments.filter((a) => a.principal === "search.identity.principalId" && a.scope === "storage").map((a) => a.role)).toEqual(["storageBlobDataReader"]);
    // Every assignment is scoped to a resource inside the course group, so deleting the group removes it.
    for (const a of assignments) expect(["search", "openai", "storage"], a.symbol).toContain(a.scope);
  });

  test("outputs what the live steps read from course/.azure/env.json", () => {
    for (const name of ["searchEndpoint", "openaiEndpoint", "embeddingDeployment", "chatDeployment", "storageAccountId", "blobEndpoint", "storageContainer"])
      expect(bicep).toMatch(new RegExp(`^output ${name} string = `, "m"));
    expect(bicep).toMatch(/^param storageContainer string/m);
    expect(config.storage.container).toMatch(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,62}$/); // a valid container name
  });
});
