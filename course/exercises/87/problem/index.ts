export interface RequestProfile {
  systemPromptTokens: number;
  queryTokens: number;
  retrievedChunks: number;
  tokensPerChunk: number;
  outputTokens: number;
  /** Mean end-to-end time a request holds a model slot, in milliseconds. */
  meanLatencyMs: number;
}

export interface Load {
  dailyRequests: number;
  /** Peak-hour rate divided by the daily average rate; at least 1. */
  peakToAverage: number;
}

export interface DeploymentLimits {
  tokensPerMinute: number;
  requestsPerMinute: number;
  /** Fraction of each limit you plan to use, in (0, 1]; the rest is headroom. */
  targetUtilisation: number;
}

export interface TokenCounts {
  input: number;
  output: number;
  total: number;
}

export interface CapacityPlan {
  inputTokensPerRequest: number;
  outputTokensPerRequest: number;
  averageRps: number;
  peakRps: number;
  peakTokensPerMinute: number;
  peakRequestsPerMinute: number;
  concurrentRequests: number;
  deploymentsNeeded: number;
  bindingConstraint: "tokens" | "requests";
}

const SECONDS_PER_DAY = 86_400;

/** Ceiling that ignores floating-point dust such as 5.000000000001. */
function ceilSafe(value: number): number {
  return Math.ceil(value - 1e-9);
}

function assertCount(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
}

export function tokensPerRequest(profile: RequestProfile): TokenCounts {
  // TODO: validate token fields, then input = system + query + chunks x tokensPerChunk.
  throw new Error("Not implemented: tokensPerRequest");
}

export function estimateCapacity(profile: RequestProfile, load: Load, limits: DeploymentLimits): CapacityPlan {
  // TODO: peak RPS, tokens and requests per minute, Little's law concurrency, deployments by the binding limit.
  throw new Error("Not implemented: estimateCapacity");
}
