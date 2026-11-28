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

function priceFor(prices: PriceTable, model: string): ModelPrice {
  const price = prices[model];
  if (!price) throw new Error(`no price for model ${model}`);
  return price;
}

function variableCost(arch: Architecture, prices: PriceTable): number {
  const price = priceFor(prices, arch.model);
  const output = (arch.outputTokens * price.output) / MILLION;
  switch (arch.kind) {
    case "rag":
      return ((arch.promptTokens + arch.retrievedTokens) * price.input) / MILLION + output + arch.retrievalCostPerQuery;
    case "fine-tune":
      return (arch.promptTokens * price.input) / MILLION + output;
    case "long-context": {
      if (arch.cachedFraction < 0 || arch.cachedFraction > 1) throw new RangeError("cachedFraction must be in [0, 1]");
      if (arch.cachedFraction > 0 && price.cachedInput === undefined) throw new Error(`no cached-input price for model ${arch.model}`);
      const cached = arch.contextTokens * arch.cachedFraction;
      const uncached = arch.promptTokens + arch.contextTokens - cached;
      return (uncached * price.input + cached * (price.cachedInput ?? 0)) / MILLION + output;
    }
  }
}

function fixedCost(arch: Architecture): number {
  switch (arch.kind) {
    case "rag":
      return arch.fixedMonthly;
    case "fine-tune":
      if (arch.amortisationMonths <= 0) throw new RangeError("amortisationMonths must be positive");
      return arch.trainingCost / arch.amortisationMonths + arch.hostingPerMonth;
    case "long-context":
      return 0;
  }
}

export function monthlyCost(arch: Architecture, queriesPerMonth: number, prices: PriceTable): CostBreakdown {
  if (queriesPerMonth < 0) throw new RangeError("queriesPerMonth must not be negative");
  const variablePerQuery = variableCost(arch, prices);
  const fixedMonthly = fixedCost(arch);
  const totalMonthly = fixedMonthly + variablePerQuery * queriesPerMonth;
  return {
    name: arch.name,
    variablePerQuery,
    fixedMonthly,
    totalMonthly,
    perQuery: queriesPerMonth === 0 ? Infinity : totalMonthly / queriesPerMonth,
  };
}

export function compareArchitectures(archs: Architecture[], queriesPerMonth: number, prices: PriceTable): CostBreakdown[] {
  return archs
    .map(arch => monthlyCost(arch, queriesPerMonth, prices))
    .sort((a, b) => a.totalMonthly - b.totalMonthly || a.name.localeCompare(b.name));
}

export function breakEvenQueries(a: Architecture, b: Architecture, prices: PriceTable): number | null {
  const costA = monthlyCost(a, 0, prices);
  const costB = monthlyCost(b, 0, prices);
  const slope = costA.variablePerQuery - costB.variablePerQuery;
  if (slope === 0) return null;
  const queries = (costB.fixedMonthly - costA.fixedMonthly) / slope;
  return queries > 0 ? queries : null;
}
