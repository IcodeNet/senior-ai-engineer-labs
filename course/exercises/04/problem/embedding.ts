// Deterministic toy embedding for offline exercises. NOT a real embedding model.
const concepts: Record<string, string> = {
  cancel: "end", terminate: "end", terminating: "end", close: "end", closing: "end",
  subscription: "membership", membership: "membership", plan: "membership",
  refund: "money-back", reimburse: "money-back", reimbursement: "money-back", repay: "money-back",
  travel: "trip", trip: "trip", journey: "trip", flight: "trip", flights: "trip",
};

function hash(word: string): number {
  let h = 2166136261;
  for (const char of word) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function embed(text: string, dimensions = 64): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    vector[hash(concepts[word] ?? word) % dimensions] += 1;
  }
  return vector;
}
