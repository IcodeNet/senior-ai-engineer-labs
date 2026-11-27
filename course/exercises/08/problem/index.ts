import { buildGroundedPrompt, checkCitations, isEligible, type Source, type Status } from "./support.ts";

export interface Candidate {
  id: string;
  title: string;
  text: string;
  score: number;
  status: Status;
  effectiveDate: string;
}

export interface SearchProvider {
  search(query: string, options: { top: number; now: Date }): Promise<Candidate[]>;
}

export type Llm = (prompt: { system: string; user: string }) => Promise<string>;

export interface AnswerOptions {
  provider: SearchProvider;
  llm: Llm;
  now: Date;
  top?: number;
  minScore?: number;
}

export type Answer =
  | { kind: "answer"; text: string; citations: Source[]; dropped: string[] }
  | { kind: "abstain"; reason: "no-evidence" | "ungrounded" | "unknown-citation"; dropped: string[] };

export async function answerQuestion(question: string, options: AnswerOptions): Promise<Answer> {
  // TODO: retrieve, re-check eligibility, gate on evidence, generate, then validate citations.
  throw new Error("Not implemented: answerQuestion");
}
