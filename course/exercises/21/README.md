# 21 · Enrich with a skillset: language and key phrases

*Module 3 · Provision and load (live) · step 5 of 7 · Track: TypeScript*

> **Cost notice.** The live test runs an enriching indexer on the billable search service that **Set up Azure** creates (lesson 17). The two built-in skills are free for 20 documents per indexer per day; the test enriches 12. Without Azure it is skipped and the offline tests still check your code.

## Concept

A **skillset** is an enrichment pipeline that an indexer runs between cracking a document and indexing it. Each skill reads nodes of an in-memory **enrichment tree** and writes new nodes; **output field mappings** on the indexer copy chosen nodes into index fields.

```text
/document                                  (one jsonArray element, cracked)
├─ chunk, title, status, …                 source fields
├─ language        ◄─ LanguageDetectionSkill(text = /document/chunk)
└─ keyPhrases      ◄─ KeyPhraseExtractionSkill(text = /document/chunk, languageCode = /document/language)
        │
        └─ outputFieldMappings: /document/language → language, /document/keyPhrases → keyPhrases
```

Why a senior engineer cares: enrichment turns raw text into filterable, facetable metadata without a separate pipeline, but it runs only at indexing time, it bills by document, and its mistakes (a wrong path) are silent nulls.

## Theory

**Skills and their types.** Built-in skills are named by `@odata.type`. This step uses `#Microsoft.Skills.Text.LanguageDetectionSkill` (outputs `languageCode`, `languageName`, `score`) and `#Microsoft.Skills.Text.KeyPhraseExtractionSkill` (inputs `text` and optional `languageCode`; parameters `defaultLanguageCode`, `maxKeyPhraseCount`; output `keyPhrases`, ordered by importance). Both are backed by Azure Language and limit a record to 50,000 characters; longer text needs the Text Split skill first.

**Context, inputs and outputs.** A skill's `context` is the node it runs once per: `/document` runs once per document; `/document/pages/*` would run once per page (step 28). An input's `source` is a path into the tree. An output lands at `<context>/<targetName>`, or `<context>/<name>` without a target name. Paths are case-sensitive: `/document/keyphrases` is not `/document/keyPhrases`.

**Execution order is a dependency graph.** The service runs a skill when the nodes it reads exist, not in the order the skills are listed. Independent skills can run in parallel. A skill that reads a path nothing produces, two skills writing the same node, or a cycle are design errors.

**Output field mappings.** Enrichments exist only in memory. Without an output field mapping they never reach the index. Field mappings (source to index) and output field mappings (tree to index) are different lists on the indexer. Targets must be top-level index fields. A source path that does not exist yields no value, which in practice means a field that stays empty.

**Billing.** Skills bound to Azure AI services are free for **20 documents per indexer per day**. Beyond that they need a billable Azure AI services resource attached to the skillset; without one, further enrichment fails rather than billing. Reprocessing counts: resetting an indexer or changing the blob makes it enrich every element again. The Text Split skill is free.

**When not to enrich.** If the metadata already exists at the source (a language column, curated tags), map it. Key phrases are statistical, not curated: good for facets and discovery, never a governance signal.

## Check questions

```question
prompt: Which @odata.type values name the built-in key phrase and language detection skills?
options:
  - "#Microsoft.Skills.Text.KeyPhraseExtractionSkill and #Microsoft.Skills.Text.LanguageDetectionSkill"
  - "#Microsoft.Skills.KeyPhraseSkill and #Microsoft.Skills.LanguageSkill"
  - keyPhraseExtractionSkill and languageDetectionSkill
answer: >-
  #Microsoft.Skills.Text.KeyPhraseExtractionSkill and #Microsoft.Skills.Text.LanguageDetectionSkill
explanation: >-
  The REST schema needs the full type names. Shorthand such as keyPhraseExtractionSkill is fine in notes but is not a
  valid @odata.type. Check the skill reference page for the exact name and its inputs and outputs.
source: handoff
```

```question
prompt: The key phrase skill is listed before language detection, and reads /document/language. What happens?
answer: It still runs after language detection, because the service orders skills by the paths they read and write, not by their position in the array.
explanation: >-
  The skillset is a dependency graph. Array order matters only for readability. A read of a path that nothing produces
  is the real error to look for.
```

```question
prompt: The skills run and produce key phrases, but the keyPhrases field is null in every document. What is the most likely cause?
answer: The indexer has no output field mapping from /document/keyPhrases to keyPhrases, or its source path is misspelt, so the enrichment never leaves memory.
explanation: >-
  Enrichments are in-memory nodes. Only output field mappings, index projections or knowledge store projections persist
  them. A wrong path does not fail the run; it just leaves the field empty.
```

```question
prompt: You reset the enriching indexer three times in one day over 12 documents with no Azure AI services resource attached. What happens on the second reset?
answer: >-
  Enrichment starts failing: the free allowance is 20 documents per indexer per day, and the runs need 36.
explanation: >-
  Without a billable resource the skills do not bill, they fail. Plan reruns, use small test sets, and attach a resource
  for real volumes.
```

## Hands-on

Implement in `index.ts`:

- `northbankSkillset()`: the two skills as in the diagram, context `/document`, `defaultLanguageCode: "en"`, `maxKeyPhraseCount: 10`.
- `outputPath(skill, output)`: `<context>/<targetName or name>`.
- `executionOrder(skillset, sourceFields)`: check inputs and duplicate outputs, then repeatedly take the skills whose inputs exist (array order among them); name a cycle when nothing is ready.
- `getPath(tree, path)` and `enrich(source, skillset, implementations)`: an offline model of the enrichment tree, with stand-in skill implementations. It supports only the `/document` context.
- `applyOutputFieldMappings(tree, mappings, index)`: copy nodes into fields; a missing node is a warning; a target the index lacks is an error.
- `enrichIndexerDefinition()`: a second indexer over the same data source into `northbank-faq-pull-v1`, with the skillset and two output field mappings.

`pipeline.ts` is a working step 20. With Azure set up, the live test creates the skillset and indexer, runs it and checks that every document has `language` and `keyPhrases`.

## Recap and next

You can define built-in skills by type, reason about the enrichment tree and dependency order, and persist enrichments with output field mappings, within the free allowance. **Next:** step 22 covers the knowledge store, which persists the same enrichment tree to Azure Storage instead of an index.

## Further reading

- [Skillset concepts](https://learn.microsoft.com/en-us/azure/search/cognitive-search-working-with-skillsets)
- [Key Phrase Extraction skill](https://learn.microsoft.com/en-us/azure/search/cognitive-search-skill-keyphrases)
- [Language Detection skill](https://learn.microsoft.com/en-us/azure/search/cognitive-search-skill-language-detection)
- [Map enriched output to index fields (output field mappings)](https://learn.microsoft.com/en-us/azure/search/cognitive-search-output-field-mapping)
- [Reference enrichments with paths](https://learn.microsoft.com/en-us/azure/search/cognitive-search-concept-annotations-syntax)
- [Attach an Azure AI services resource to a skillset](https://learn.microsoft.com/en-us/azure/search/cognitive-search-attach-cognitive-services)
