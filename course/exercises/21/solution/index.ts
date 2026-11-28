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
  return {
    name: SKILLSET,
    description: "Detect the language of each Northbank chunk and extract its key phrases.",
    skills: [
      {
        "@odata.type": LANGUAGE_SKILL,
        name: "detect-language",
        context: "/document",
        inputs: [{ name: "text", source: "/document/chunk" }],
        outputs: [{ name: "languageCode", targetName: "language" }],
      },
      {
        "@odata.type": KEY_PHRASE_SKILL,
        name: "key-phrases",
        context: "/document",
        defaultLanguageCode: "en",
        maxKeyPhraseCount: 10,
        inputs: [
          { name: "text", source: "/document/chunk" },
          { name: "languageCode", source: "/document/language" },
        ],
        outputs: [{ name: "keyPhrases", targetName: "keyPhrases" }],
      },
    ],
  };
}

/** Where a skill output lands in the enrichment tree: the skill's context plus the target name (or the output name). */
export function outputPath(skill: Skill, output: SkillOutput): string {
  return `${skill.context}/${output.targetName ?? output.name}`;
}

const covers = (available: string, path: string) => path === available || path.startsWith(`${available}/`);

/**
 * The order skills can run in. The service orders skills by their inputs and outputs, not by their position in the
 * array, so a skill runs once every path it reads exists. Unknown inputs, duplicate outputs and cycles are errors.
 */
export function executionOrder(skillset: Skillset, sourceFields: string[]): string[] {
  const producers = new Map<string, string>();
  for (const skill of skillset.skills)
    for (const output of skill.outputs) {
      const path = outputPath(skill, output);
      const other = producers.get(path);
      if (other) throw new Error(`${path} is produced by both ${other} and ${skill.name}`);
      producers.set(path, skill.name);
    }
  const available = new Set(sourceFields.map((f) => `/document/${f}`));
  const isAvailable = (path: string) => [...available].some((a) => covers(a, path));
  for (const skill of skillset.skills)
    for (const input of skill.inputs)
      if (!isAvailable(input.source) && ![...producers.keys()].some((p) => covers(p, input.source)))
        throw new Error(`skill ${skill.name} input ${input.name} reads ${input.source}, which nothing produces`);
  const order: string[] = [];
  let pending = [...skillset.skills];
  while (pending.length) {
    const ready = pending.filter((s) => s.inputs.every((i) => isAvailable(i.source)));
    if (!ready.length) throw new Error(`skills ${pending.map((s) => s.name).join(", ")} depend on each other`);
    for (const skill of ready) {
      order.push(skill.name);
      for (const output of skill.outputs) available.add(outputPath(skill, output));
    }
    pending = pending.filter((s) => !ready.includes(s));
  }
  return order;
}

export function getPath(tree: EnrichmentTree, path: string): unknown {
  const parts = path.split("/").filter(Boolean);
  let node: unknown = tree;
  for (const part of parts) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

function setPath(tree: EnrichmentTree, path: string, value: unknown): void {
  const parts = path.split("/").filter(Boolean);
  let node = tree as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) node = (node[part] ??= {}) as Record<string, unknown>;
  node[parts.at(-1)!] = value;
}

/** Run a skillset over one source document, offline, with stand-in implementations. Only the /document context is modelled. */
export function enrich(source: Record<string, unknown>, skillset: Skillset, implementations: Record<string, SkillImplementation>): EnrichmentTree {
  const tree: EnrichmentTree = { document: structuredClone(source) };
  const byName = new Map(skillset.skills.map((s) => [s.name, s]));
  for (const name of executionOrder(skillset, Object.keys(source))) {
    const skill = byName.get(name)!;
    if (skill.context !== "/document") throw new Error(`skill ${name}: this model supports only the /document context`);
    const implementation = implementations[skill["@odata.type"]];
    if (!implementation) throw new Error(`no implementation for ${skill["@odata.type"]}`);
    const inputs = Object.fromEntries(skill.inputs.map((i) => [i.name, getPath(tree, i.source)]));
    const outputs = implementation(inputs, skill);
    for (const output of skill.outputs) setPath(tree, outputPath(skill, output), outputs[output.name]);
  }
  return tree;
}

/** Output field mappings: enrichment nodes to top-level index fields. A missing node is a warning; an unknown field is an error. */
export function applyOutputFieldMappings(
  tree: EnrichmentTree,
  mappings: { sourceFieldName: string; targetFieldName: string }[],
  index: IndexDefinition,
): { fields: Record<string, unknown>; warnings: string[] } {
  const fields: Record<string, unknown> = {};
  const warnings: string[] = [];
  for (const mapping of mappings) {
    if (!mapping.sourceFieldName.startsWith("/document")) throw new Error(`output field mapping source must start with /document: ${mapping.sourceFieldName}`);
    if (!index.fields.some((f) => f.name === mapping.targetFieldName)) throw new Error(`index ${index.name} has no field ${mapping.targetFieldName}`);
    const value = getPath(tree, mapping.sourceFieldName);
    if (value === undefined) warnings.push(`${mapping.sourceFieldName} does not exist in the enrichment tree`);
    else fields[mapping.targetFieldName] = value;
  }
  return { fields, warnings };
}

/** A second indexer over the same blobs that runs the skillset and maps its outputs into the pull index. */
export function enrichIndexerDefinition(): Indexer {
  return {
    name: ENRICH_INDEXER,
    dataSourceName: DATA_SOURCE,
    targetIndexName: PULL_INDEX,
    skillsetName: SKILLSET,
    parameters: { configuration: { parsingMode: "jsonArray", indexedFileNameExtensions: ".json" } },
    fieldMappings: [],
    outputFieldMappings: [
      { sourceFieldName: "/document/language", targetFieldName: "language" },
      { sourceFieldName: "/document/keyPhrases", targetFieldName: "keyPhrases" },
    ],
  };
}
