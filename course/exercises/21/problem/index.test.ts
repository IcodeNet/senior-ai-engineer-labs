import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { SEARCH_API, STORAGE_API, azureHttp, liveStorage } from "./azure.ts";
import { NORTHBANK_DOCUMENTS } from "./northbank.ts";
import { BLOB, PULL_INDEX, blobUrl, createOrUpdate, dataSourceDefinition, pullIndex, runIndexer, toBlobRecords, uploadBlob, waitForIndexer } from "./pipeline.ts";
import {
  ENRICH_INDEXER,
  KEY_PHRASE_SKILL,
  LANGUAGE_SKILL,
  applyOutputFieldMappings,
  enrich,
  enrichIndexerDefinition,
  executionOrder,
  getPath,
  northbankSkillset,
  outputPath,
  type Skill,
  type Skillset,
} from "./index.ts";

// Offline stand-ins for the two built-in skills: deterministic, and enough to reason about the tree.
const fakes = {
  [LANGUAGE_SKILL]: (inputs: Record<string, unknown>) => ({ languageCode: /\b(el|la|les)\b/.test(String(inputs.text)) ? "fr" : "en", languageName: "English", score: 1 }),
  [KEY_PHRASE_SKILL]: (inputs: Record<string, unknown>) => ({
    keyPhrases: String(inputs.text)
      .split(/[.,]/)
      .map((s) => s.trim().split(" ").slice(0, 2).join(" "))
      .filter(Boolean)
      .map((p) => `${p} [${inputs.languageCode}]`),
  }),
};
const source = toBlobRecords(NORTHBANK_DOCUMENTS)[0] as unknown as Record<string, unknown>;
const skill = (name: string, inputs: string[], outputs: string[]): Skill => ({
  "@odata.type": KEY_PHRASE_SKILL,
  name,
  context: "/document",
  inputs: inputs.map((source, i) => ({ name: `in${i}`, source })),
  outputs: outputs.map((targetName) => ({ name: "keyPhrases", targetName })),
});

describe("the Northbank skillset", () => {
  test("uses the built-in skills by their @odata.type, over each chunk", () => {
    const s = northbankSkillset();
    assert.equal(s.name, "northbank-enrichment");
    assert.deepEqual(s.skills.map((k) => k["@odata.type"]), ["#Microsoft.Skills.Text.LanguageDetectionSkill", "#Microsoft.Skills.Text.KeyPhraseExtractionSkill"]);
    for (const k of s.skills) assert.equal(k.context, "/document");
    assert.deepEqual(s.skills[0].inputs, [{ name: "text", source: "/document/chunk" }]);
    assert.deepEqual(s.skills[1].inputs, [{ name: "text", source: "/document/chunk" }, { name: "languageCode", source: "/document/language" }]);
    assert.equal(s.skills[1].defaultLanguageCode, "en");
    assert.equal(s.skills[1].maxKeyPhraseCount, 10);
  });

  test("outputs land at context plus target name", () => {
    const [language, phrases] = northbankSkillset().skills;
    assert.equal(outputPath(language, language.outputs[0]), "/document/language");
    assert.equal(outputPath(phrases, phrases.outputs[0]), "/document/keyPhrases");
    assert.equal(outputPath({ ...phrases, context: "/document/pages/*" }, { name: "keyPhrases" }), "/document/pages/*/keyPhrases");
  });
});

describe("execution order comes from dependencies, not array position", () => {
  test("key phrases wait for the language they read, even when listed first", () => {
    const s = northbankSkillset();
    assert.deepEqual(executionOrder(s, ["chunk", "title"]), ["detect-language", "key-phrases"]);
    assert.deepEqual(executionOrder({ ...s, skills: [...s.skills].reverse() }, ["chunk"]), ["detect-language", "key-phrases"]);
  });

  test("independent skills keep array order; nested paths are covered by their parent", () => {
    const s: Skillset = { name: "x", skills: [skill("b", ["/document/title"], ["b"]), skill("a", ["/document/chunk"], ["a"]), skill("c", ["/document/a/deep"], ["c"])] };
    assert.deepEqual(executionOrder(s, ["chunk", "title"]), ["b", "a", "c"]);
  });

  test("a missing input, a duplicate output or a cycle is an error that names the problem", () => {
    assert.throws(() => executionOrder(northbankSkillset(), ["title"]), /skill detect-language input text reads \/document\/chunk, which nothing produces/);
    assert.throws(() => executionOrder({ name: "x", skills: [skill("a", ["/document/chunk"], ["out"]), skill("b", ["/document/chunk"], ["out"])] }, ["chunk"]), /\/document\/out is produced by both a and b/);
    assert.throws(() => executionOrder({ name: "x", skills: [skill("a", ["/document/b"], ["a"]), skill("b", ["/document/a"], ["b"])] }, ["chunk"]), /skills a, b depend on each other/);
  });
});

describe("the enrichment tree", () => {
  test("starts as the source document and grows with each skill's outputs", () => {
    const tree = enrich(source, northbankSkillset(), fakes);
    assert.equal(getPath(tree, "/document/chunk"), source.chunk);
    assert.equal(getPath(tree, "/document/language"), "en");
    assert.ok(Array.isArray(getPath(tree, "/document/keyPhrases")));
    assert.match((getPath(tree, "/document/keyPhrases") as string[])[0], /\[en\]$/, "key phrases ran after, and used, the detected language");
    assert.equal(getPath(tree, "/document/nothing/here"), undefined);
    assert.equal("language" in source, false, "the source document is not modified");
  });

  test("only declared outputs are kept, a missing implementation or another context is an error", () => {
    const tree = enrich(source, northbankSkillset(), fakes);
    assert.equal(getPath(tree, "/document/score"), undefined, "score is produced but not declared as an output");
    assert.throws(() => enrich(source, northbankSkillset(), { [LANGUAGE_SKILL]: fakes[LANGUAGE_SKILL] }), /no implementation for #Microsoft\.Skills\.Text\.KeyPhraseExtractionSkill/);
    const pages = northbankSkillset();
    pages.skills[1].context = "/document/pages/*";
    assert.throws(() => enrich(source, pages, fakes), /only the \/document context/);
  });
});

describe("output field mappings", () => {
  const index = pullIndex(4);

  test("the enriching indexer maps both enrichments into the pull index", () => {
    const indexer = enrichIndexerDefinition();
    assert.equal(indexer.name, "northbank-enrich-indexer");
    assert.equal(indexer.skillsetName, "northbank-enrichment");
    assert.equal(indexer.targetIndexName, PULL_INDEX);
    assert.equal(indexer.parameters.configuration.parsingMode, "jsonArray");
    const { fields, warnings } = applyOutputFieldMappings(enrich(source, northbankSkillset(), fakes), indexer.outputFieldMappings!, index);
    assert.deepEqual(Object.keys(fields).sort(), ["keyPhrases", "language"]);
    assert.equal(fields.language, "en");
    assert.deepEqual(warnings, []);
  });

  test("a typo in a source path is a warning (the field stays empty); a target outside the index is an error", () => {
    const tree = enrich(source, northbankSkillset(), fakes);
    assert.deepEqual(applyOutputFieldMappings(tree, [{ sourceFieldName: "/document/keyphrases", targetFieldName: "keyPhrases" }], index), {
      fields: {},
      warnings: ["/document/keyphrases does not exist in the enrichment tree"],
    });
    assert.throws(() => applyOutputFieldMappings(tree, [{ sourceFieldName: "/document/language", targetFieldName: "lang" }], index), /has no field lang/);
    assert.throws(() => applyOutputFieldMappings(tree, [{ sourceFieldName: "language", targetFieldName: "language" }], index), /must start with \/document/);
  });
});

describe.runIf(liveStorage)("live: an enriching indexer", () => {
  test("fills language and key phrases for every document", { timeout: 300_000 }, async () => {
    const env = liveStorage!;
    // Upload only when the blob is missing: re-uploading changes it, and the indexers then reprocess every element, which
    // counts against the skills' free 20 documents per indexer per day (12 elements here).
    const existing = await azureHttp({ method: "GET", url: blobUrl(env, BLOB), audience: "storage", headers: { "x-ms-version": STORAGE_API } });
    if (existing.status === 404) await uploadBlob(azureHttp, env, BLOB, toBlobRecords(NORTHBANK_DOCUMENTS));
    else assert.equal(existing.status, 200);
    await createOrUpdate(azureHttp, env.searchEndpoint, "indexes", pullIndex(env.dimensions));
    await createOrUpdate(azureHttp, env.searchEndpoint, "datasources", dataSourceDefinition(env));
    await createOrUpdate(azureHttp, env.searchEndpoint, "skillsets", northbankSkillset());
    const started = new Date(Date.now() - 5_000);
    if ((await createOrUpdate(azureHttp, env.searchEndpoint, "indexers", enrichIndexerDefinition())) === 200) await runIndexer(azureHttp, env.searchEndpoint, ENRICH_INDEXER);
    await waitForIndexer(azureHttp, env.searchEndpoint, ENRICH_INDEXER, { since: started, timeoutMs: 240_000 });
    const response = await azureHttp({
      method: "POST",
      url: `${env.searchEndpoint}/indexes/${PULL_INDEX}/docs/search?api-version=${SEARCH_API}`,
      body: { search: "*", select: "id, language, keyPhrases", top: 50 },
      audience: "search",
    });
    assert.equal(response.status, 200);
    const docs = response.body.value as { language: string | null; keyPhrases: string[] | null }[];
    assert.equal(docs.length, NORTHBANK_DOCUMENTS.length);
    for (const d of docs) {
      assert.equal(d.language, "en");
      assert.ok((d.keyPhrases ?? []).length > 0, "each chunk has key phrases");
    }
    console.log(docs.slice(0, 3).map((d) => d.keyPhrases?.join(", ")).join("\n"));
  });
});
