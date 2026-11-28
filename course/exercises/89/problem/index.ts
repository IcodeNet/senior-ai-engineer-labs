/** Price per million tokens. Placeholder values in tests are not real prices. */
export interface ModelPrice {
  input: number;
  output: number;
  cachedInput?: number;
}

export type PriceTable = Record<string, ModelPrice>;

export type Architecture =
  | {
      kind: "rag";
      name: string;
      model: string;
      promptTokens: number;
      retrievedTokens: number;
      outputTokens: number;
      /** Search, embedding and rerank cost per query. */
      retrievalCostPerQuery: number;
      /** Search service and indexing pipeline per month. */
      fixedMonthly: number;
    }
  | {
      kind: "fine-tune";
      name: string;
      model: string;
      promptTokens: number;
      outputTokens: number;
      /** One-off training cost, spread over the months before the next retrain. */
      trainingCost: number;
      amortisationMonths: number;
      hostingPerMonth: number;
    }
  | {
      kind: "long-context";
      name: string;
      model: string;
      promptTokens: number;
      contextTokens: number;
      outputTokens: number;
      /** Fraction of context tokens served from the provider's prompt cache, in [0, 1]. */
      cachedFraction: number;
    };

export interface CostBreakdown {
  name: string;
  variablePerQuery: number;
  fixedMonthly: number;
  totalMonthly: number;
  perQuery: number;
}

const MILLION = 1_000_000;

export function monthlyCost(arch: Architecture, queriesPerMonth: number, prices: PriceTable): CostBreakdown {
  // TODO: variable cost per query by architecture kind, fixed monthly cost, total and per-query cost.
  throw new Error("Not implemented: monthlyCost");
}

export function compareArchitectures(archs: Architecture[], queriesPerMonth: number, prices: PriceTable): CostBreakdown[] {
  // TODO: breakdowns sorted cheapest first.
  throw new Error("Not implemented: compareArchitectures");
}

export function breakEvenQueries(a: Architecture, b: Architecture, prices: PriceTable): number | null {
  // TODO: volume where the two cost lines cross, or null.
  throw new Error("Not implemented: breakEvenQueries");
}
