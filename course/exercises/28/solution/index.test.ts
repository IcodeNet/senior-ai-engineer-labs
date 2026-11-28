import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { SEARCH_API, STORAGE_API, azureHttp, fakeEnv, liveStorage } from "./azure.ts";
import { DOCUMENTS } from "./documents.ts";
import { governanceFilter } from "./northbank.ts";
import { blobUrl, createOrUpdate, dataSourceDefinition, runIndexer, uploadBlob, waitForIndexer } from "./pipeline.ts";
import {
  EMBEDDING_SKILL,
  GUIDES_BLOB,
  GUIDES_FOLDER,
  SPLIT_SKILL,
  VEC_DATA_SOURCE,
  VEC_INDEX,
  VEC_INDEXER,
  guideRecords,
  reviewIntegratedVectorization,
  textVectorQuery,
  vectorIndex,
  vectorIndexerDefinition,
  vectorSkillset,
  type VectorSkillset,
} from "./index.ts";
import type { IndexDefinition } from "./northbank.ts";

const env = { ...fakeEnv, dimensions: 1536 };
const rules = (index: IndexDefinition, skillset: VectorSkillset) => reviewIntegratedVectorization(index, skillset).map((p) => p.rule);
const fresh = () => ({ index: structuredClone(vectorIndex(env)), skillset: structuredClone(vectorSkillset(env)) });
const embed = (s: VectorSkillset) => s.skills.find((k) => k["@odata.type"] === EMBEDDING_SKILL)!;
const split = (s: VectorSkillset) => s.skills.find((k) => k["@odata.type"] === SPLIT_SKILL)!;

describe("the chunk index", () => {
  test("one document per chunk, governance fields on every chunk, a keyword-analysed key and a parent link", () => {
    const index = vectorIndex(env);
    assert.equal(index.name, "northbank-guides-vec-v1");
    const field = (n: string) => index.fields.find((f) => f.name === n)!;
    assert.deepEqual([field("chunk_id").key, field("chunk_id").analyzer], [true, "keyword"]);
    assert.deepEqual([field("parent_id").type, field("parent_id").filterable, field("parent_id").key], ["Edm.String", true, undefined]);
    for (const name of ["status", "effectiveDate", "expiryDate"]) assert.equal(field(name).filterable, true, name);
    assert.equal(field("chunkVector").dimensions, 1536);
  });

  test("the vector profile has a keyless Azure OpenAI vectorizer for text queries", () => {
    const { vectorSearch } = vectorIndex(env);
    assert.deepEqual(vectorSearch!.profiles, [{ name: "northbank-guides-profile", algorithm: "northbank-hnsw", vectorizer: "northbank-openai" }]);
    assert.deepEqual(vectorSearch!.vectorizers, [
      { name: "northbank-openai", kind: "azureOpenAI", azureOpenAIParameters: { resourceUri: "https://oai-test.openai.azure.com", deploymentId: "embed", modelName: "text-embedding-3-small" } },
    ]);
  });
});

describe("the vectorization skillset", () => {
  test("splits each guide into overlapping pages, then embeds each page", () => {
    const s = vectorSkillset(env);
    assert.equal(s.name, "northbank-guides-vectorize");
    assert.deepEqual(s.skills.map((k) => [k["@odata.type"], k.context]), [
      ["#Microsoft.Skills.Text.SplitSkill", "/document"],
      ["#Microsoft.Skills.Text.AzureOpenAIEmbeddingSkill", "/document/pages/*"],
    ]);
    assert.deepEqual([split(s).textSplitMode, split(s).maximumPageLength, split(s).pageOverlapLength], ["pages", 600, 150]);
    assert.deepEqual(split(s).inputs, [{ name: "text", source: "/document/body" }]);
    assert.deepEqual([embed(s).deploymentId, embed(s).modelName, embed(s).dimensions, embed(s).resourceUri], ["embed", "text-embedding-3-small", 1536, "https://oai-test.openai.azure.com"]);
    assert.equal("apiKey" in embed(s), false);
    assert.deepEqual(embed(s).outputs, [{ name: "embedding", targetName: "vector" }]);
  });

  test("index projections make one chunk document per page, carrying the parent's governance fields", () => {
    const { indexProjections } = vectorSkillset(env);
    assert.deepEqual(indexProjections.parameters, { projectionMode: "skipIndexingParentDocuments" });
    const [selector] = indexProjections.selectors;
    assert.deepEqual([selector.targetIndexName, selector.parentKeyFieldName, selector.sourceContext], [VEC_INDEX, "parent_id", "/document/pages/*"]);
    assert.deepEqual(Object.fromEntries(selector.mappings.map((m) => [m.name, m.source])), {
      chunk: "/document/pages/*",
      chunkVector: "/document/pages/*/vector",
      title: "/document/title",
      sourceUri: "/document/sourceUri",
      status: "/document/status",
      effectiveDate: "/document/effectiveDate",
      expiryDate: "/document/expiryDate",
    });
  });

  test("the indexer reads the guides folder as JSON arrays", () => {
    assert.deepEqual(vectorIndexerDefinition(), {
      name: VEC_INDEXER,
      dataSourceName: VEC_DATA_SOURCE,
      targetIndexName: VEC_INDEX,
      skillsetName: "northbank-guides-vectorize",
      parameters: { configuration: { parsingMode: "jsonArray", indexedFileNameExtensions: ".json" } },
      fieldMappings: [],
    });
    assert.equal(GUIDES_BLOB, "guides/northbank-guides.json");
    assert.deepEqual(guideRecords(DOCUMENTS).map((d) => d.id), ["overdrafts", "cards", "abroad"]);
  });
});

describe("reviewing integrated vectorization", () => {
  test("the course's definitions pass", () => {
    const { index, skillset } = fresh();
    assert.deepEqual(reviewIntegratedVectorization(index, skillset), []);
  });

  test("model, deployment, resource and dimensions must match between skill, vectorizer and field", () => {
    let { index, skillset } = fresh();
    embed(skillset).modelName = "text-embedding-3-large";
    assert.deepEqual(rules(index, skillset), ["model"]);
    ({ index, skillset } = fresh());
    embed(skillset).deploymentId = "embed-2";
    assert.deepEqual(rules(index, skillset), ["deployment"]);
    ({ index, skillset } = fresh());
    embed(skillset).resourceUri = "https://elsewhere.openai.azure.com/";
    assert.deepEqual(rules(index, skillset), ["resource"]);
    ({ index, skillset } = fresh());
    embed(skillset).dimensions = 512;
    assert.deepEqual(rules(index, skillset), ["dimensions"]);
    ({ index, skillset } = fresh());
    index.vectorSearch!.profiles[0].vectorizer = undefined;
    assert.deepEqual(rules(index, skillset), ["model"]);
  });

  test("keys anywhere are flagged; the service's identity is the credential", () => {
    const { index, skillset } = fresh();
    embed(skillset).apiKey = "secret";
    index.vectorSearch!.vectorizers![0].azureOpenAIParameters!.apiKey = "secret";
    assert.deepEqual(rules(index, skillset).sort(), ["keyless", "keyless"]);
  });

  test("chunk size and overlap stay within the Text Split skill's rules", () => {
    let { index, skillset } = fresh();
    split(skillset).maximumPageLength = 200;
    split(skillset).pageOverlapLength = 50;
    assert.deepEqual(rules(index, skillset), ["split"]);
    ({ index, skillset } = fresh());
    split(skillset).pageOverlapLength = 300;
    assert.deepEqual(rules(index, skillset), ["split"]);
    ({ index, skillset } = fresh());
    split(skillset).textSplitMode = "sentences";
    assert.deepEqual(rules(index, skillset), ["split"]);
  });

  test("the embedding and the projection must work on the pages", () => {
    let { index, skillset } = fresh();
    embed(skillset).context = "/document";
    assert.deepEqual(rules(index, skillset), ["context"]);
    ({ index, skillset } = fresh());
    skillset.indexProjections.selectors[0].sourceContext = "/document";
    assert.deepEqual(rules(index, skillset), ["context"]);
  });

  test("projection mappings: every field but the keys, never the keys, and no parent documents", () => {
    let { index, skillset } = fresh();
    skillset.indexProjections.selectors[0].mappings = skillset.indexProjections.selectors[0].mappings.filter((m) => m.name !== "status");
    assert.deepEqual(reviewIntegratedVectorization(index, skillset).map((p) => p.message), ["status is not mapped, so every chunk would have it empty"]);
    ({ index, skillset } = fresh());
    skillset.indexProjections.selectors[0].mappings.push({ name: "parent_id", source: "/document/id" }, { name: "chunk_id", source: "/document/id" }, { name: "nope", source: "/document/x" });
    assert.deepEqual(rules(index, skillset), ["projection", "projection", "projection"]);
    ({ index, skillset } = fresh());
    skillset.indexProjections.parameters = {};
    assert.deepEqual(rules(index, skillset), ["projection"]);
    ({ index, skillset } = fresh());
    skillset.indexProjections.selectors[0].targetIndexName = "other";
    assert.deepEqual(rules(index, skillset), ["projection"]);
  });

  test("the key needs the keyword analyzer; the parent field must be a filterable string", () => {
    let { index, skillset } = fresh();
    index.fields[0].analyzer = undefined;
    assert.deepEqual(rules(index, skillset), ["key"]);
    ({ index, skillset } = fresh());
    index.fields.find((f) => f.name === "parent_id")!.filterable = false;
    assert.deepEqual(rules(index, skillset), ["key"]);
  });
});

describe("text vector queries", () => {
  test("send text; the vectorizer embeds it; governance still applies", () => {
    assert.deepEqual(textVectorQuery("charged past my limit?", 3, "2026-11-28"), {
      vectorQueries: [{ kind: "text", text: "charged past my limit?", fields: "chunkVector", k: 3 }],
      filter: governanceFilter("2026-11-28"),
      select: "chunk_id,parent_id,title,chunk,sourceUri,status",
      top: 3,
    });
    assert.throws(() => textVectorQuery("  ", 3, "2026-11-28"), /needs text/);
    assert.throws(() => textVectorQuery("x", 0, "2026-11-28"), RangeError);
  });
});

describe.runIf(liveStorage)("live: integrated vectorization", () => {
  test("the service chunks and embeds the guides, and a text query finds the right chunk", { timeout: 360_000 }, async () => {
    const live = liveStorage!;
    const existing = await azureHttp({ method: "GET", url: blobUrl(live, GUIDES_BLOB), audience: "storage", headers: { "x-ms-version": STORAGE_API } });
    if (existing.status === 404) await uploadBlob(azureHttp, live, GUIDES_BLOB, guideRecords(DOCUMENTS) as never);
    await createOrUpdate(azureHttp, live.searchEndpoint, "indexes", vectorIndex(live));
    await createOrUpdate(azureHttp, live.searchEndpoint, "datasources", dataSourceDefinition(live, VEC_DATA_SOURCE, GUIDES_FOLDER));
    await createOrUpdate(azureHttp, live.searchEndpoint, "skillsets", vectorSkillset(live));
    const started = new Date(Date.now() - 5_000);
    if ((await createOrUpdate(azureHttp, live.searchEndpoint, "indexers", vectorIndexerDefinition())) === 200) await runIndexer(azureHttp, live.searchEndpoint, VEC_INDEXER);
    await waitForIndexer(azureHttp, live.searchEndpoint, VEC_INDEXER, { since: started, timeoutMs: 300_000 });
    let hits: { sourceUri: string; chunk: string }[] = [];
    for (let i = 0; i < 20 && !hits.length; i++) {
      if (i) await new Promise((r) => setTimeout(r, 2000));
      const response = await azureHttp({
        method: "POST",
        url: `${live.searchEndpoint}/indexes/${VEC_INDEX}/docs/search?api-version=${SEARCH_API}`,
        body: textVectorQuery("Am I charged when a payment would take me past my limit?", 3, "2026-11-28"),
        audience: "search",
      });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      hits = response.body.value;
    }
    assert.match(hits[0].sourceUri, /guides\/overdrafts$/);
    console.log(hits.map((h) => `${h.sourceUri}: ${h.chunk.slice(0, 80)}…`).join("\n"));
  });
});
