import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { azureHttp, live } from "./azure.ts";
import { chunks, evalCases, type EvalCase } from "./corpus.ts";
import type { Retriever } from "./evaluation.ts";
import { createOrUpdateIndex, embedTexts, indexDefinition, toIndexActions, uploadDocuments } from "./indexing.ts";
import { buildSearchRequest, searchIndex, type Mode } from "./retrieval.ts";
import { bestMode, compareModes, formatTable } from "./index.ts";

const cases: EvalCase[] = [
  { id: "a", query: "a", relevant: { x: 3 } },
  { id: "b", query: "b", relevant: { y: 3 } },
];
const fixed = (rankings: Record<string, string[]>): Retriever => async (query) => rankings[query];

test("every mode is evaluated on the same labelled cases", async () => {
  const results = await compareModes(cases, { keyword: fixed({ a: ["x"], b: ["z"] }), vector: fixed({ a: ["z"], b: ["y"] }), hybrid: fixed({ a: ["x"], b: ["y"] }), semantic: fixed({ a: ["z", "x"], b: ["y"] }) }, 5);
  assert.deepEqual(Object.keys(results), ["keyword", "vector", "hybrid", "semantic"]);
  assert.equal(results.keyword.recall, 0.5);
  assert.equal(results.hybrid.recall, 1);
  assert.equal(results.semantic.mrr, 0.75);
});

test("the best mode is chosen per metric, keeping the first on ties", () => {
  const scores = (recall: number, mrr: number) => ({ recall, mrr, precision: 0, ndcg: 0 });
  const results = { keyword: scores(0.5, 1), vector: scores(0.9, 0.4), hybrid: scores(0.9, 0.8), semantic: scores(0.8, 0.9) };
  assert.equal(bestMode(results, "recall"), "vector");
  assert.equal(bestMode(results, "mrr"), "keyword");
  assert.throws(() => bestMode({} as typeof results, "recall"), RangeError);
});

test("results are reported as a markdown table", () => {
  const table = formatTable({ keyword: { recall: 0.5, precision: 0.1, mrr: 0.5, ndcg: 0.456 } } as never, 5);
  assert.equal(table, "| Mode | Recall@5 | Precision@5 | MRR | NDCG@5 |\n|---|---|---|---|---|\n| keyword | 0.50 | 0.10 | 0.50 | 0.46 |");
});

describe.runIf(live)("live: evaluate retrieval modes on Azure", () => {
  test("compares keyword, vector, hybrid and semantic on the labelled set", { timeout: 300_000 }, async () => {
    const env = live!;
    await createOrUpdateIndex(azureHttp, env.searchEndpoint, indexDefinition(env.indexName, env.dimensions));
    await uploadDocuments(azureHttp, env.searchEndpoint, env.indexName, toIndexActions(chunks, await embedTexts(azureHttp, env, chunks.map((c) => `${c.title}\n${c.content}`))));
    await new Promise((r) => setTimeout(r, 3000));
    const vectors = new Map((await embedTexts(azureHttp, env, evalCases.map((c) => c.query))).map((v, i) => [evalCases[i].query, v]));
    const retriever = (mode: Mode): Retriever => async (query) =>
      (await searchIndex(azureHttp, env.searchEndpoint, env.indexName, buildSearchRequest(mode, query, vectors.get(query), { top: 5, now: new Date() }))).map((h) => h.chunkId);
    const modes: Mode[] = ["keyword", "vector", "hybrid", "semantic"];
    const results = await compareModes(evalCases, Object.fromEntries(modes.map((m) => [m, retriever(m)])) as Record<Mode, Retriever>, 5);
    console.log(`\n${formatTable(results, 5)}\n\nBest Recall@5: ${bestMode(results, "recall")}. Now shut down: npm run azure:down`);
    assert.ok(modes.some((m) => results[m].recall > 0));
  });
});
