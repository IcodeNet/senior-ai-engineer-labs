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
  const { provider, llm, now, top = 5, minScore = 0 } = options;
  const candidates = await provider.search(question, { top, now });
  const eligible = candidates.filter((candidate) => isEligible(candidate, now));
  const dropped = candidates.filter((candidate) => !isEligible(candidate, now)).map((candidate) => candidate.id);
  const prompt = buildGroundedPrompt(question, eligible, { minScore, maxSources: top });
  if (prompt.kind === "abstain") return { kind: "abstain", reason: "no-evidence", dropped };
  const text = await llm({ system: prompt.system, user: prompt.user });
  const { cited, unknown } = checkCitations(text, prompt.sources);
  if (unknown.length > 0) return { kind: "abstain", reason: "unknown-citation", dropped };
  if (cited.length === 0) return { kind: "abstain", reason: "ungrounded", dropped };
  const byLabel = new Map(prompt.sources.map((source) => [source.label, source]));
  return { kind: "answer", text, citations: cited.map((label) => byLabel.get(label)!), dropped };
}
