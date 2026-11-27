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
  // TODO: encode the chunk ID so it only uses characters Azure AI Search allows in keys, reversibly.
  throw new Error("Not implemented: documentKey");
}

export async function embedTexts(http: Http, env: AzureEnv, texts: string[], batchSize = 16): Promise<number[][]> {
  // TODO: POST batches to openai/v1/embeddings, restore input order, check dimensions.
  throw new Error("Not implemented: embedTexts");
}

export function toIndexActions(chunks: PolicyChunk[], vectors: number[][]): IndexActions {
  // TODO: one mergeOrUpload action per chunk; isLatest only for the highest approved version of each document.
  throw new Error("Not implemented: toIndexActions");
}

export async function uploadDocuments(http: Http, endpoint: string, index: string, actions: IndexActions): Promise<number> {
  // TODO: POST to docs/index; a 207 can hide per-document failures.
  throw new Error("Not implemented: uploadDocuments");
}
