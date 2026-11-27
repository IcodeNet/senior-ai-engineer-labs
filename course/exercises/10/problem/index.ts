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

export async function evaluateRetriever(cases: EvalCase[], retriever: Retriever, k = 5): Promise<Report> {
  // TODO: retrieve once per case, score the top k, average, and list the worst cases.
  throw new Error("Not implemented: evaluateRetriever");
}

export async function compareK(cases: EvalCase[], retriever: Retriever, ks: number[]): Promise<Record<number, Scores>> {
  // TODO: one retrieval per case, mean metrics for every k.
  throw new Error("Not implemented: compareK");
}
