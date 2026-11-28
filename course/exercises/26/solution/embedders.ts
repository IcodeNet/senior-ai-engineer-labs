// Toy embedding models for offline experiments. You do not need to change this file.
// Each model hashes words into a fixed number of dimensions with its own seed. They are deterministic and capture word
// overlap, not meaning, but they behave like real models in the way that matters here: two models place the same text
// in unrelated spaces, so their vectors are not comparable.

export interface Embedding {
  model: string;
  dimensions: number;
  vector: number[];
}

function hash(text: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  // Final mixing, so that every output bit depends on the seed.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function toyModel(name: string, seed: number, dimensions: number) {
  return (text: string): Embedding => {
    const vector = new Array<number>(dimensions).fill(0);
    for (const word of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
      const h = hash(word, seed);
      vector[h % dimensions] += h & 1 ? 1 : -1;
    }
    return { model: name, dimensions, vector };
  };
}

export const small = toyModel("toy-small", 7, 64);
export const other = toyModel("toy-other", 1234567, 64);
// The same model asked for more dimensions, as text-embedding-3 models allow: still not comparable with 64-dimension vectors.
export const wide = toyModel("toy-small", 7, 128);
