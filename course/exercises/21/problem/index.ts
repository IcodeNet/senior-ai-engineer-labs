import { type IndexDefinition } from "./northbank.ts";
import { DATA_SOURCE, PULL_INDEX, type Indexer } from "./pipeline.ts";

export const SKILLSET = "northbank-enrichment";
export const ENRICH_INDEXER = "northbank-enrich-indexer";
export const LANGUAGE_SKILL = "#Microsoft.Skills.Text.LanguageDetectionSkill";
export const KEY_PHRASE_SKILL = "#Microsoft.Skills.Text.KeyPhraseExtractionSkill";

export interface SkillInput {
  name: string;
  source: string;
}
export interface SkillOutput {
  name: string;
  targetName?: string;
}
export interface Skill {
  "@odata.type": string;
  name: string;
  context: string;
  inputs: SkillInput[];
  outputs: SkillOutput[];
  [parameter: string]: unknown;
}
export interface Skillset {
  name: string;
  description?: string;
  skills: Skill[];
}
export type EnrichmentTree = { document: Record<string, unknown> };
/** An offline stand-in for a built-in skill: named inputs in, named outputs out. */
export type SkillImplementation = (inputs: Record<string, unknown>, skill: Skill) => Record<string, unknown>;

/** Language detection, then key phrases in the detected language, both over each chunk. */
export function northbankSkillset(): Skillset {
  // TODO: two skills with context /document: language detection over /document/chunk (languageCode → language), then key phrases over /document/chunk in /document/language (keyPhrases), defaultLanguageCode en, maxKeyPhraseCount 10.
  throw new Error("Not implemented: northbankSkillset");
}

/** Where a skill output lands in the enrichment tree: the skill's context plus the target name (or the output name). */
export function outputPath(skill: Skill, output: SkillOutput): string {
  // TODO: <context>/<targetName or name>.
  throw new Error("Not implemented: outputPath");
}

const covers = (available: string, path: string) => path === available || path.startsWith(`${available}/`);

/**
 * The order skills can run in. The service orders skills by their inputs and outputs, not by their position in the
 * array, so a skill runs once every path it reads exists. Unknown inputs, duplicate outputs and cycles are errors.
 */
export function executionOrder(skillset: Skillset, sourceFields: string[]): string[] {
  // TODO: collect every output path (duplicates are errors); check every input is a source field or some output; then repeatedly run the skills whose inputs exist, in array order; none ready means a cycle.
  throw new Error("Not implemented: executionOrder");
}

export function getPath(tree: EnrichmentTree, path: string): unknown {
  // TODO: walk the tree along the path segments; undefined when a segment is missing.
  throw new Error("Not implemented: getPath");
}

function setPath(tree: EnrichmentTree, path: string, value: unknown): void {
  const parts = path.split("/").filter(Boolean);
  let node = tree as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as Record<string, unknown>;
  node[parts.at(-1)!] = value;
}

/** Run a skillset over one source document, offline, with stand-in implementations. Only the /document context is modelled. */
export function enrich(source: Record<string, unknown>, skillset: Skillset, implementations: Record<string, SkillImplementation>): EnrichmentTree {
  // TODO: tree { document: copy }, then for each skill in executionOrder: read inputs with getPath, call the implementation for its @odata.type, write outputs at outputPath. Only context /document.
  throw new Error("Not implemented: enrich");
}

/** Output field mappings: enrichment nodes to top-level index fields. A missing node is a warning; an unknown field is an error. */
export function applyOutputFieldMappings(
  tree: EnrichmentTree,
  mappings: { sourceFieldName: string; targetFieldName: string }[],
  index: IndexDefinition,
): { fields: Record<string, unknown>; warnings: string[] } {
  // TODO: for each mapping: source must start with /document, target must be an index field; a missing node is a warning, otherwise copy the value.
  throw new Error("Not implemented: applyOutputFieldMappings");
}

/** A second indexer over the same blobs that runs the skillset and maps its outputs into the pull index. */
export function enrichIndexerDefinition(): Indexer {
  // TODO: ENRICH_INDEXER over DATA_SOURCE into PULL_INDEX with SKILLSET, jsonArray, .json, and output field mappings for language and keyPhrases.
  throw new Error("Not implemented: enrichIndexerDefinition");
}
