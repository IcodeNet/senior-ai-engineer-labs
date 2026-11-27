import { SEARCH_API, type AzureEnv, type Http } from "./azure.ts";
import type { PolicyChunk } from "./corpus.ts";

export interface IndexAction {
  "@search.action": "mergeOrUpload";
  id: string;
  docId: string;
  title: string;
  content: string;
  status: string;
  version: number;
  isLatest: boolean;
  effectiveDate: string;
  contentVector: number[];
}

export interface IndexActions {
  value: IndexAction[];
}

/** Search document keys allow only letters, digits, "_", "-" and "="; base64url keeps every chunk ID unique and valid. */
export function documentKey(chunkId: string): string {
  return Buffer.from(chunkId, "utf8").toString("base64url");
}

export async function embedTexts(http: Http, env: AzureEnv, texts: string[], batchSize = 16): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const batch = texts.slice(start, start + batchSize);
    const response = await http({
      method: "POST",
      url: new URL("openai/v1/embeddings", env.openaiEndpoint).toString(),
      body: { model: env.embeddingDeployment, input: batch },
      audience: "openai",
    });
    if (response.status !== 200) throw new Error(`embedding failed: ${response.status} ${response.body?.error?.message ?? ""}`.trim());
    const data = [...(response.body.data as { index: number; embedding: number[] }[])].sort((a, b) => a.index - b.index);
    if (data.length !== batch.length) throw new Error(`embedding returned ${data.length} vectors for ${batch.length} inputs`);
    for (const item of data) {
      if (item.embedding.length !== env.dimensions)
        throw new Error(`embedding has ${item.embedding.length} dimensions, index expects ${env.dimensions}`);
      vectors.push(item.embedding);
    }
  }
  return vectors;
}

export function toIndexActions(chunks: PolicyChunk[], vectors: number[][]): IndexActions {
  if (chunks.length !== vectors.length) throw new RangeError("one vector per chunk is required");
  const latest = new Map<string, number>();
  for (const chunk of chunks)
    if (chunk.status === "approved") latest.set(chunk.docId, Math.max(latest.get(chunk.docId) ?? -Infinity, chunk.version));
  return {
    value: chunks.map((chunk, i) => ({
      "@search.action": "mergeOrUpload",
      id: documentKey(chunk.id),
      docId: chunk.docId,
      title: chunk.title,
      content: chunk.content,
      status: chunk.status,
      version: chunk.version,
      isLatest: chunk.status === "approved" && latest.get(chunk.docId) === chunk.version,
      effectiveDate: chunk.effectiveDate,
      contentVector: vectors[i],
    })),
  };
}

export async function uploadDocuments(http: Http, endpoint: string, index: string, actions: IndexActions): Promise<number> {
  const response = await http({
    method: "POST",
    url: `${endpoint}/indexes/${encodeURIComponent(index)}/docs/index?api-version=${SEARCH_API}`,
    body: actions,
    audience: "search",
  });
  if (response.status !== 200 && response.status !== 207)
    throw new Error(`upload failed: ${response.status} ${response.body?.error?.message ?? ""}`.trim());
  const results = response.body.value as { key: string; status: boolean; errorMessage?: string }[];
  const failed = results.find((result) => !result.status);
  if (failed) throw new Error(`indexing failed for ${failed.key}: ${failed.errorMessage ?? "unknown error"}`);
  return results.length;
}
