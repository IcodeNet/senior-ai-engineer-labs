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
  assertCount("systemPromptTokens", profile.systemPromptTokens);
  assertCount("queryTokens", profile.queryTokens);
  assertCount("retrievedChunks", profile.retrievedChunks);
  assertCount("tokensPerChunk", profile.tokensPerChunk);
  assertCount("outputTokens", profile.outputTokens);
  const input = profile.systemPromptTokens + profile.queryTokens + profile.retrievedChunks * profile.tokensPerChunk;
  return { input, output: profile.outputTokens, total: input + profile.outputTokens };
}

export function estimateCapacity(profile: RequestProfile, load: Load, limits: DeploymentLimits): CapacityPlan {
  const tokens = tokensPerRequest(profile);
  if (load.dailyRequests < 0) throw new RangeError("dailyRequests must not be negative");
  if (load.peakToAverage < 1) throw new RangeError("peakToAverage must be at least 1");
  if (limits.tokensPerMinute <= 0 || limits.requestsPerMinute <= 0) throw new RangeError("limits must be positive");
  if (limits.targetUtilisation <= 0 || limits.targetUtilisation > 1) throw new RangeError("targetUtilisation must be in (0, 1]");
  if (profile.meanLatencyMs < 0) throw new RangeError("meanLatencyMs must not be negative");

  const averageRps = load.dailyRequests / SECONDS_PER_DAY;
  const peakRps = averageRps * load.peakToAverage;
  const peakRequestsPerMinute = peakRps * 60;
  const peakTokensPerMinute = peakRequestsPerMinute * tokens.total;
  const byTokens = ceilSafe(peakTokensPerMinute / (limits.tokensPerMinute * limits.targetUtilisation));
  const byRequests = ceilSafe(peakRequestsPerMinute / (limits.requestsPerMinute * limits.targetUtilisation));
  return {
    inputTokensPerRequest: tokens.input,
    outputTokensPerRequest: tokens.output,
    averageRps,
    peakRps,
    peakTokensPerMinute,
    peakRequestsPerMinute,
    // Little's law: requests in flight = arrival rate x time in the system.
    concurrentRequests: ceilSafe(peakRps * (profile.meanLatencyMs / 1000)),
    deploymentsNeeded: Math.max(1, byTokens, byRequests),
    bindingConstraint: byTokens >= byRequests ? "tokens" : "requests",
  };
}
