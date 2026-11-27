export interface Scored {
  id: string;
  score: number;
}

export interface FusionOptions {
  k?: number;
  top?: number;
}

export function reciprocalRankFusion(rankings: string[][], options: FusionOptions = {}): Scored[] {
  const { k = 60, top = 5 } = options;
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    const seen = new Set<string>();
    ranking.forEach((id, index) => {
      if (seen.has(id)) return;
      seen.add(id);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0))
    .slice(0, top);
}

export function hybridSearch(lexical: Scored[], vector: Scored[], options: FusionOptions = {}): Scored[] {
  return reciprocalRankFusion([lexical.map((r) => r.id), vector.map((r) => r.id)], options);
}
