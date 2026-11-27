export interface Document {
  id: string;
  text: string;
}

export interface Scored {
  id: string;
  score: number;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
  top?: number;
}

export function terms(text: string): string[] {
  // TODO: lower-case and split on anything that is not a letter or digit.
  throw new Error("Not implemented: terms");
}

export function bm25Search(query: string, chunks: Document[], options: Bm25Options = {}): Scored[] {
  // TODO: IDF, term-frequency saturation (k1) and length normalisation (b).
  throw new Error("Not implemented: bm25Search");
}
