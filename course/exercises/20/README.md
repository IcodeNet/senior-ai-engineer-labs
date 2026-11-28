# 20 · Grounded answers with Azure OpenAI

> **Cost notice.** The live tests in this step call real, billable Azure resources created by the **Set up Azure** action (lesson 17). Azure AI Search Basic is charged for every hour it exists; Azure OpenAI is charged per token. The red cost banner shows while anything may exist. When you finish the lab, run **Shut down Azure** and then **Verify cost is zero** from the Actions tab (lesson 21; terminal: `npm run azure:down`, `npm run azure:verify`). Without Azure set up, the live tests are skipped and the offline tests still check your code.

## Why it matters
This step runs a provided grounded-answer pipeline (`pipeline.ts`) against real services: Azure AI Search retrieves, your code **re-checks eligibility**, builds the grounded prompt with untrusted sources, Azure OpenAI generates, and citations are validated before anything reaches a user.

Production details that matter:

- **Content filtering.** Azure OpenAI can stop a response (`finish_reason: content_filter`); that is a failure to handle, not an answer.
- **Empty output.** Reasoning models spend completion tokens thinking; a too-small `max_completion_tokens` can return an empty message with `finish_reason: length`.
- **Token accounting.** Record input and output tokens per request — multiplied by the per-million token prices from `azure:plan`, they give the cost of each answer.

## Interview question
> A user reports the assistant quoted a policy that was withdrawn last week. Trace every place in this pipeline where that should have been stopped, and how you would prove which one failed.

## Your task
Implement in `index.ts`:

- `chatComplete(http, env, { system, user }, maxTokens = 4000)` — `POST` to `openai/v1/chat/completions` with `{ model: env.chatDeployment, messages: [system, user], max_completion_tokens }`, audience `openai`. Throw `chat failed: <status> <message>`, `answer blocked by the content filter`, or `empty answer (finish_reason: <reason>)`. Return `{ text, inputTokens, outputTokens }` from `usage`.
- `toCandidates(hits)` — map search hits to the pipeline's `Candidate`s keyed by `chunkId`, keeping `status` and `effectiveDate` so the pipeline can re-check them.

**What you're given.** `pipeline.ts` is a working grounded-answer pipeline: retrieve candidates, drop any that are not approved or not yet effective (a second check behind the search filter), put the rest in the prompt as escaped, untrusted sources, refuse to answer without evidence, then abstain when the answer cites a source that was not provided or cites nothing. You only connect it to Azure here; the foundation modules will teach each part in full.

 `retrieval.ts` and `indexing.ts` are working steps 17–19.

## Going further
Stream responses, cache embeddings for repeated questions, add Azure AI Content Safety Prompt Shields, and log source IDs and token counts with every answer for audit.
