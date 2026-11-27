import type { EvalCase } from "./corpus.ts";
import { evaluateRetriever, type Retriever, type Scores } from "./evaluation.ts";
import type { Mode } from "./retrieval.ts";

export async function compareModes(cases: EvalCase[], retrievers: Record<Mode, Retriever>, k = 5): Promise<Record<Mode, Scores>> {
  const results = {} as Record<Mode, Scores>;
  for (const mode of Object.keys(retrievers) as Mode[]) results[mode] = (await evaluateRetriever(cases, retrievers[mode], k)).mean;
  return results;
}

export function bestMode(results: Record<Mode, Scores>, metric: keyof Scores): Mode {
  const modes = Object.keys(results) as Mode[];
  if (modes.length === 0) throw new RangeError("no results to compare");
  return modes.reduce((best, mode) => (results[mode][metric] > results[best][metric] ? mode : best));
}

export function formatTable(results: Record<Mode, Scores>, k: number): string {
  const rows = (Object.keys(results) as Mode[]).map((mode) => {
    const s = results[mode];
    return `| ${mode} | ${s.recall.toFixed(2)} | ${s.precision.toFixed(2)} | ${s.mrr.toFixed(2)} | ${s.ndcg.toFixed(2)} |`;
  });
  return [`| Mode | Recall@${k} | Precision@${k} | MRR | NDCG@${k} |`, "|---|---|---|---|---|", ...rows].join("\n");
}
