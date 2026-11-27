# 40 · Cost models: RAG vs fine-tuning vs long context

## Why it matters
"Should we use RAG, fine-tune a model, or just put everything in a long context window?" is partly a quality question and partly a **cost-shape** question. Each architecture has a different mix of fixed and variable cost:

- **RAG**: a fixed monthly search service and indexing pipeline, plus per query a few thousand input tokens of retrieved context and a small retrieval cost.
- **Fine-tuning**: a one-off training cost (amortised until the next retrain because knowledge goes stale) and often hourly hosting for the tuned model, but short prompts per query.
- **Long context**: no fixed infrastructure, but tens of thousands of input tokens per query; prompt caching makes repeated context cheaper, not free.

Writing each as `total = fixed + variablePerQuery × queries` lets you rank them at a given volume and find the **break-even volume** where two lines cross: `q = (fixedB − fixedA) / (variableA − variableB)`, which only exists when it is positive.

Prices in the tests are placeholders. Verify current pricing for your model, region and agreement; caching discounts and hosting fees vary by provider.

## Interview question
> Your team proposes fine-tuning a model on 5,000 internal policy documents instead of building RAG "because it will be cheaper per query". How do you evaluate that claim?

## Model answer outline
- Separate the questions: fine-tuning teaches style and format well but is poor at injecting changing facts and gives no citations or access control; RAG gives provenance, freshness and per-document permissions.
- Build the cost model: fixed (search service, training amortised over retrain cadence, hosting) vs variable (tokens per query × prices). Show totals at expected and 10× volume and the break-even point.
- Include hidden costs: retraining when documents change, evaluation runs per retrain, index rebuilds, cache hit-rate assumptions for long context.
- Sensitivity: which assumption flips the decision (volume, chunk count, cache hit rate, retrain frequency)?
- Typical conclusion: RAG for facts that change and need citations; fine-tune a small model for format/tone or classification on top; long context for small, stable corpora or prototypes.

## Your task
Implement in `index.ts`:

- `monthlyCost(arch, queriesPerMonth, prices)` → `{ name, variablePerQuery, fixedMonthly, totalMonthly, perQuery }`:
  - RAG: `(prompt + retrieved) × input + output × outputPrice + retrievalCostPerQuery`; fixed = `fixedMonthly`.
  - Fine-tune: `prompt × input + output × outputPrice`; fixed = `trainingCost / amortisationMonths + hostingPerMonth`.
  - Long context: cached context tokens (`contextTokens × cachedFraction`) at `cachedInput`, the rest of prompt and context at `input`, plus output; fixed = 0.
  - Prices are per million tokens. `perQuery` is `totalMonthly / queries` (`Infinity` at zero queries).
  - Throw `Error("no price for model <model>")`, `Error("no cached-input price for model <model>")` when caching is used without a cached price, and `RangeError` for negative queries, `amortisationMonths <= 0` or `cachedFraction` outside `[0, 1]`.
- `compareArchitectures(archs, queriesPerMonth, prices)` — breakdowns sorted cheapest first (ties by name).
- `breakEvenQueries(a, b, prices)` — the positive crossing volume, or `null` when slopes are equal or one option is cheaper at every volume.

## Going further
Add a quality-adjusted cost (cost per correct, cited answer), model a hybrid (fine-tuned small model plus RAG) and plot total cost against volume for all three.
