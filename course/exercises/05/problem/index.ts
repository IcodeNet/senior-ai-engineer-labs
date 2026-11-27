export interface Scored {
  id: string;
  score: number;
}

export interface FusionOptions {
  k?: number;
  top?: number;
}

export function reciprocalRankFusion(rankings: string[][], options: FusionOptions = {}): Scored[] {
  // TODO: sum 1 / (k + rank) across rankings, counting each id once per ranking.
  throw new Error("Not implemented: reciprocalRankFusion");
}

export function hybridSearch(lexical: Scored[], vector: Scored[], options: FusionOptions = {}): Scored[] {
  // TODO: fuse the two result lists by their order.
  throw new Error("Not implemented: hybridSearch");
}
