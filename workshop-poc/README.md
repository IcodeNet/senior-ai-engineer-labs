# Icode Workshop — independent prototype

A local-only proof of concept for a reusable learning platform. This is an isolated experimental branch, **not** a change to the Phase 0 verification branch. No Azure resources, network services or external workshop-framework dependencies.

## Try it (Node 22)

```bash
node workshop-poc/cli.mjs list
node workshop-poc/cli.mjs set 01
node workshop-poc/cli.mjs test
node workshop-poc/cli.mjs diff
node --test workshop-poc/cli.test.mjs
```

`set` copies a problem into `workshop-poc/playground`. If that directory exists, it is renamed to a timestamped backup before switching. `test` executes the playground's own Node tests; `diff` shows the playground versus the reference solution using the system `diff -u` command (Mac/Linux). No source code from third-party workshop packages is included.

## Architecture decision

**Separate platform repository is the target**: `IcodeNet/icode-workshop`, with content in `senior-ai-engineer-labs`. This branch is a staging prototype because a new repository cannot be created with the available GitHub connector. Once a repository is provisioned, move this isolated code into it rather than merging it into the labs main branch.

## Review findings and gates

- Verified by source inspection: the reference course uses `epicshop`, `@epic-web/workshop-app`, `@epic-web/workshop-utils`, `execa`, `fs-extra`, `chokidar`, and `globby`.
- Diff rendering: evaluate `@pierre/diffs` independently for browser UI; do not make it a prerequisite for CLI exercise switching. Confirm licence and exact API before adoption.
- A framework's published npm availability does not itself grant unrestricted redistribution rights.
- Required next checks: run tests on Mac/CI, test backups and path safety, review licence/security of any dependencies, add a React interface, then connect an external content repository.
- No claim of a green test run is made until execution evidence is available.

## Functional acceptance

1. List exercises.
2. Select problem and preserve existing playground as backup.
3. Compare playground to solution without modifying either.
4. Run local tests and return a nonzero exit code on failure.
5. Reject unknown exercise identifiers and prevent path traversal.
6. Keep content separate from platform in the production design.
