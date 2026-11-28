import type { AzureEnv, Http } from "./azure.ts";
import type { Candidate } from "./pipeline.ts";
import type { Hit } from "./retrieval.ts";

export interface Completion {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function chatComplete(http: Http, env: AzureEnv, prompt: { system: string; user: string }, maxTokens = 4000): Promise<Completion> {
  // TODO: POST to openai/v1/chat/completions; treat content filtering and empty answers as errors.
  throw new Error("Not implemented: chatComplete");
}

/** Map search hits to the candidates the Module 8 pipeline re-checks before prompting. */
export function toCandidates(hits: Hit[]): Candidate[] {
  // TODO: map hits to the candidates the Module 8 pipeline expects.
  throw new Error("Not implemented: toCandidates");
}
