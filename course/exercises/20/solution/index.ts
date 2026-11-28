import type { AzureEnv, Http } from "./azure.ts";
import type { Candidate } from "./pipeline.ts";
import type { Hit } from "./retrieval.ts";

export interface Completion {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function chatComplete(http: Http, env: AzureEnv, prompt: { system: string; user: string }, maxTokens = 4000): Promise<Completion> {
  const response = await http({
    method: "POST",
    url: new URL("openai/v1/chat/completions", env.openaiEndpoint).toString(),
    body: {
      model: env.chatDeployment,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      max_completion_tokens: maxTokens,
    },
    audience: "openai",
  });
  if (response.status !== 200) throw new Error(`chat failed: ${response.status} ${response.body?.error?.message ?? ""}`.trim());
  const choice = response.body.choices?.[0];
  if (choice?.finish_reason === "content_filter") throw new Error("answer blocked by the content filter");
  const text = choice?.message?.content ?? "";
  if (text.trim() === "") throw new Error(`empty answer (finish_reason: ${choice?.finish_reason ?? "unknown"})`);
  return { text, inputTokens: response.body.usage?.prompt_tokens ?? 0, outputTokens: response.body.usage?.completion_tokens ?? 0 };
}

/** Map search hits to the candidates the provided pipeline re-checks before prompting. */
export function toCandidates(hits: Hit[]): Candidate[] {
  return hits.map((hit) => ({
    id: hit.chunkId,
    title: hit.title,
    text: hit.content,
    score: hit.score,
    status: hit.status as Candidate["status"],
    effectiveDate: hit.effectiveDate,
  }));
}
