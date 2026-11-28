# 01 · Welcome: what you'll build and how Icode works

*Module 0 · Welcome · step 1 of 2 · Track: TypeScript*

## Concept

This course teaches one subject properly: **Azure AI Search** (Microsoft now documents it as *Foundry IQ (Azure AI Search)*), and how an application, a React FAQ app and an agent use it to answer questions from governed content.

You build one system from first principles to production: **Northbank Support**, a governed FAQ knowledge base for a fictional bank. Northbank's rule is simple and strict: **only approved, in-date content may ever reach the model.** Every module adds one layer.

```text
Module 1–2   search foundations and index design        (offline: you build the mechanisms)
Module 3     provision and load a real index            (paid: Azure, with set-up and shutdown)
Module 4–7   chunking, embeddings, hybrid, governance, evaluation
Module 8     a grounded-answer API with citations
Module 9     a React FAQ app on that API
Module 10    an agent that uses Search as a tool
Module 11    operate, shut down, capstone
Advanced     agents and MCP, production AI, architecture drills
```

Why a senior engineer cares: most "RAG" failures are retrieval and governance failures, not model failures. A model can only quote what retrieval gave it, and can only leak what retrieval was allowed to return. If you can design, measure and explain the retrieval layer, you can explain the whole system.

## Theory

**How Icode works.** Each step is a folder with a lesson (this README), a **Playground** you edit (`problem/`), tests and a reference solution (`solution/`). The tests run in the workshop with **Run tests**. A starter always fails with `Not implemented: <function>`; your job is to make it pass. Your work is saved in `.workshop/`, survives restarts, and **Reset** restores the starter while keeping a backup.

The tests are practice feedback, not grading. You can read them, and you should: they are the specification. They are not tamper-proof and do not need to be.

**Actions and the cost banner.** The **Actions** tab runs course scripts, such as planning, set-up, status, shutdown and verification for the paid steps. Destructive actions are marked and ask you to type a confirmation. A red **cost banner** appears on every lesson while paid Azure resources exist, may exist, or cannot be ruled out. Step 02 explains exactly when it appears and what clears it. Nothing in Modules 0–2 creates anything in Azure.

**Tracks.** Concepts, theory and check questions are shared. The hands-on code is per track. TypeScript with Vitest is available now; .NET and FastAPI tracks are planned and will use their own languages and test runners.

**Check questions.** Every foundation step has 3–5 interview-style questions (Lab 03 and the advanced modules still have one interview question each until they are reworked). Each has an answer and an explanation of *why*. Until the workshop renders them as interactive quizzes, they appear as YAML blocks: cover the `answer` and `explanation` lines, commit to an answer, then read on.

**Failure modes this course is designed against:** treating "the model said so" as evidence; filtering in the prompt instead of the server; believing a green schema check means a true answer; and leaving a billable service running over a weekend.

## Check questions

```question
prompt: Northbank's rule is that only approved, in-date content may reach the model. Where must that rule be enforced?
options:
  - In the system prompt, by telling the model to ignore drafts
  - In the React client, by hiding drafts from the results list
  - In the backend query to Azure AI Search, as a filter the caller cannot remove
  - After generation, by checking the answer for draft wording
answer: In the backend query to Azure AI Search, as a filter the caller cannot remove
explanation: >-
  A model can only leak what it was given, so the safe place to stop a draft is before it is retrieved. A prompt
  instruction is a request the model may ignore or be talked out of; a client-side filter is under the user's
  control; checking the output afterwards is too late and cannot recognise every leak. A server-side filter applied
  to every query is the only point you control completely.
```

```question
prompt: 'What does a failing starter with the message "Not implemented: readiness" tell you?'
options:
  - The workshop is broken and needs reinstalling
  - The step is set up correctly and is waiting for you to implement readiness
  - The tests are wrong
answer: The step is set up correctly and is waiting for you to implement readiness
explanation: >-
  Every starter is designed to fail on purpose, on the unimplemented function and not on setup. If a starter fails for
  any other reason, such as a missing module or a syntax error, that is a real problem worth reporting.
```

```question
prompt: A teammate says "the RAG system answered wrongly, so we need a bigger model". What is the first thing a senior engineer checks?
answer: What retrieval returned for that question, and whether the right, approved evidence was in it.
explanation: >-
  Generation quality is bounded by retrieval. If the right passage was not retrieved, or a stale or unapproved one was,
  a bigger model will produce a more fluent wrong answer. Inspecting the retrieved set (and later measuring it with
  Precision@5 and Recall@5 in Module 7) separates retrieval failures from generation failures.
```


## Hands-on

Write the course **readiness check**: the logic behind a doctor command. It is split in two: probing the machine produces a plain `Facts` object, and a pure function judges it.

Implement in `index.ts`:

- `parseVersion(text)` reads `major.minor[.patch]` from strings such as `v22.13.0` or `git version 2.47.1`, and throws `Not a version` otherwise.
- `atLeast(version, minimum)` compares numerically (22.9 is older than 22.13).
- `readiness(facts)` returns one check per id, in order: `node` (fail below 22.13.0), `npm` and `git` (fail if missing), `engine` (fail if not installed, warn if it differs from the pin), `azure-cli` (warn if missing: only Module 3 onwards needs it) and `cost` (warn when any cost marker is present). `ready` is false only when something failed; `billable` is true when a cost marker exists.
- `summary(report)` prints `✔`, `!` or `✖`, the id and the message on one line per check, then a verdict.

Then compare with the real thing: in a terminal in `course/`, run `npm run doctor`. It checks Node.js and npm for the workshop engine.

## Recap and next

You know what you will build, why governance comes first, how lessons, tests, actions and the cost banner work, and you have written a testable readiness check. **Next:** step 02 explains what the paid steps cost, how set-up and shutdown work, and exactly when the cost banner may be cleared, before anything is created.

## Further reading

- [What is Foundry IQ (Azure AI Search)?](https://learn.microsoft.com/en-us/azure/search/search-what-is-azure-search)
- [Retrieval-augmented generation in Azure AI Search](https://learn.microsoft.com/en-us/azure/search/retrieval-augmented-generation-overview)
- Icode Workshop course authoring: `docs/course-authoring.md` in the [engine repository](https://github.com/IcodeNet/Icode-workshop)
