import type { EvalCase } from "./corpus.ts";
import { evaluateRetriever, type Retriever, type Scores } from "./evaluation.ts";
import type { Mode } from "./retrieval.ts";

export async function compareModes(cases: EvalCase[], retrievers: Record<Mode, Retriever>, k = 5): Promise<Record<Mode, Scores>> {
  // TODO: evaluate every retrieval mode on the same cases with the provided harness.
  throw new Error("Not implemented: compareModes");
}

export function bestMode(results: Record<Mode, Scores>, metric: keyof Scores): Mode {
  // TODO: the mode with the highest value for the metric, keeping the first on ties.
  throw new Error("Not implemented: bestMode");
}

export function formatTable(results: Record<Mode, Scores>, k: number): string {
  // TODO: a markdown table with two decimal places.
  throw new Error("Not implemented: formatTable");
}
