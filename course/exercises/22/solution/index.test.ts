import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { chunkShaper, northbankKnowledgeStore, projectTable, reviewKnowledgeStore, type EnrichmentTree, type KnowledgeStore } from "./index.ts";

const STORAGE = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-test/providers/Microsoft.Storage/storageAccounts/sttest";
const produced = ["/document/id", "/document/title", "/document/sourceUri", "/document/chunk", "/document/language", "/document/keyPhrases", "/document/chunkShape"];
const rules = (store: KnowledgeStore, paths = produced) => reviewKnowledgeStore(store, paths).map((p) => p.rule);
const edit = (change: (s: KnowledgeStore) => void) => {
  const store = northbankKnowledgeStore(STORAGE);
  change(store);
  return store;
};
const tree: EnrichmentTree = {
  document: {
    id: "k1",
    title: "Overdraft fees",
    chunkShape: { id: "k1", title: "Overdraft fees", language: "en", keyPhrases: ["arranged overdraft", "EAR variable"] },
  },
};

describe("shaping and projecting the Northbank enrichments", () => {
  test("a Shaper skill gathers the chunk's nodes into /document/chunkShape", () => {
    const shaper = chunkShaper();
    assert.equal(shaper["@odata.type"], "#Microsoft.Skills.Util.ShaperSkill");
    assert.equal(shaper.context, "/document");
    assert.deepEqual(shaper.inputs.map((i) => i.source), ["/document/id", "/document/title", "/document/sourceUri", "/document/language", "/document/keyPhrases"]);
    assert.deepEqual(shaper.outputs, [{ name: "output", targetName: "chunkShape" }]);
  });

  test("one projection group: two related tables and one JSON object, keyless", () => {
    const store = northbankKnowledgeStore(STORAGE);
    assert.equal(store.storageConnectionString, `ResourceId=${STORAGE};`);
    assert.equal(store.projections.length, 1);
    const [group] = store.projections;
    assert.deepEqual(group.tables.map((t) => [t.tableName, t.source]), [
      ["northbankChunks", "/document/chunkShape"],
      ["northbankKeyPhrases", "/document/chunkShape/keyPhrases/*"],
    ]);
    assert.deepEqual(group.objects.map((o) => [o.storageContainer, o.source]), [["northbank-enriched", "/document/chunkShape"]]);
    assert.deepEqual(group.files, []);
    assert.deepEqual(reviewKnowledgeStore(store, produced), []);
  });
});

describe("reviewing a knowledge store", () => {
  test("an account key in the connection string is flagged", () => {
    assert.deepEqual(rules(edit((s) => (s.storageConnectionString = "DefaultEndpointsProtocol=https;AccountName=sttest;AccountKey=abc;"))), ["connection"]);
  });

  test("sources must be /document paths the skillset produces", () => {
    assert.deepEqual(rules(edit((s) => (s.projections[0].tables[0].source = "/document/shape"))), ["source"]);
    assert.deepEqual(rules(edit((s) => (s.projections[0].objects[0].source = "chunkShape"))), ["source"]);
    assert.deepEqual(rules(northbankKnowledgeStore(STORAGE), produced.filter((p) => p !== "/document/chunkShape")), ["source", "source", "source"]);
  });

  test("table and container names follow Azure Storage naming", () => {
    assert.deepEqual(rules(edit((s) => (s.projections[0].tables[0].tableName = "northbank-chunks"))), ["table-name"]);
    assert.deepEqual(rules(edit((s) => (s.projections[0].tables[0].tableName = "1chunks"))), ["table-name"]);
    assert.deepEqual(rules(edit((s) => (s.projections[0].objects[0].storageContainer = "Northbank_Enriched"))), ["container-name"]);
    assert.deepEqual(rules(edit((s) => (s.projections[0].objects[0].storageContainer = "nb--x"))), ["container-name"]);
  });

  test("file projections only hold normalised images", () => {
    const store = edit((s) => s.projections[0].files.push({ storageContainer: "northbank-images", source: "/document/chunkShape" }));
    assert.deepEqual(rules(store), ["file-source"]);
    const images = edit((s) => s.projections[0].files.push({ storageContainer: "northbank-images", source: "/document/normalized_images/*" }));
    assert.deepEqual(rules(images, [...produced, "/document/normalized_images"]), []);
  });

  test("empty groups and two projections writing one table or container are flagged", () => {
    assert.deepEqual(rules(edit((s) => s.projections.push({ tables: [], objects: [], files: [] }))), ["empty-group"]);
    const twice = edit((s) => s.projections.push(structuredClone(s.projections[0])));
    assert.deepEqual(rules(twice).sort(), ["duplicate-target", "duplicate-target", "duplicate-target"]);
  });
});

describe("what a table projection writes (a model)", () => {
  test("an object source is one row with the shape's columns, related by document key", () => {
    const [chunks] = northbankKnowledgeStore(STORAGE).projections[0].tables;
    assert.deepEqual(projectTable(tree, "k1", chunks), [
      { chunkKey: "k1_northbankChunks_0", documentKey: "k1", id: "k1", title: "Overdraft fees", language: "en", keyPhrases: ["arranged overdraft", "EAR variable"] },
    ]);
  });

  test("a collection source ending in /* is one row per element", () => {
    const [, phrases] = northbankKnowledgeStore(STORAGE).projections[0].tables;
    assert.deepEqual(projectTable(tree, "k1", phrases), [
      { phraseKey: "k1_northbankKeyPhrases_0", documentKey: "k1", value: "arranged overdraft" },
      { phraseKey: "k1_northbankKeyPhrases_1", documentKey: "k1", value: "EAR variable" },
    ]);
  });

  test("a missing node writes nothing; a shape mismatch is an error", () => {
    assert.deepEqual(projectTable(tree, "k1", { tableName: "x", generatedKeyName: "k", source: "/document/missing" }), []);
    assert.throws(() => projectTable(tree, "k1", { tableName: "x", generatedKeyName: "k", source: "/document/title/*" }), /not a collection/);
    assert.throws(() => projectTable(tree, "k1", { tableName: "x", generatedKeyName: "k", source: "/document/title" }), /not an object; shape it first/);
  });
});
