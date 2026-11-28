// Working harness from Module 7. You do not need to change this file.
import { meanOf, ndcgAtK, precisionAtK, recallAtK, reciprocalRank } from "./metrics.ts";

export interface EvalCase {
  id: string;
  query: string;
  relevant: Record<string, number>;
}

export type Retriever = (query: string) => Promise<string[]>;

export interface Scores {
  precision: number;
  recall: number;
  mrr: number;
  ndcg: number;
}

export interface CaseResult extends Scores {
  id: string;
  retrieved: string[];
  missed: string[];
}

export interface Report {
  k: number;
  cases: CaseResult[];
  mean: Scores;
  worst: string[];
}

async function retrieveAll(cases: EvalCase[], retriever: Retriever): Promise<string[][]> {
  const rankings: string[][] = [];
  for (const item of cases) {
    try {
      rankings.push(await retriever(item.query));
    } catch (error) {
      throw new Error(`retrieval failed for ${item.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return rankings;
}

function score(item: EvalCase, ranking: string[], k: number): CaseResult {
  const relevant = new Set(Object.keys(item.relevant));
  const grades = new Map(Object.entries(item.relevant));
  const top = [...new Set(ranking)].slice(0, k);
  return {
    id: item.id,
    retrieved: top,
    precision: precisionAtK(top, relevant, k),
    recall: recallAtK(top, relevant, k),
    mrr: reciprocalRank(top, relevant),
    ndcg: ndcgAtK(top, grades, k),
    missed: [...relevant].filter((id) => !top.includes(id)).sort(),
  };
}

function average(results: CaseResult[]): Scores {
  return {
    precision: meanOf(results.map((r) => r.precision)),
    recall: meanOf(results.map((r) => r.recall)),
    mrr: meanOf(results.map((r) => r.mrr)),
    ndcg: meanOf(results.map((r) => r.ndcg)),
  };
}

export async function evaluateRetriever(cases: EvalCase[], retriever: Retriever, k = 5): Promise<Report> {
  const rankings = await retrieveAll(cases, retriever);
  const results = cases.map((item, index) => score(item, rankings[index], k));
  const worst = [...results]
    .sort((a, b) => a.recall - b.recall || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .slice(0, 3)
    .map((r) => r.id);
  return { k, cases: results, mean: average(results), worst };
}

export async function compareK(cases: EvalCase[], retriever: Retriever, ks: number[]): Promise<Record<number, Scores>> {
  const rankings = await retrieveAll(cases, retriever);
  const comparison: Record<number, Scores> = {};
  for (const k of ks) comparison[k] = average(cases.map((item, index) => score(item, rankings[index], k)));
  return comparison;
}
