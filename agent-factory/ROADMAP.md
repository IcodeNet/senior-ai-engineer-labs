# Agent Improvement Factory — Capability Roadmap

## Vision
Build a governed, evidence-driven AI software engineering system that can plan, implement, review, test, evaluate and improve its workflows. **This is a roadmap, not a claim that these capabilities exist today.** Improvement means versioned prompts, instructions, tools, tests and processes; model fine-tuning is a separate optional research track.

## Capability inventory
| ID | Capability | Intended outcome |
|---|---|---|
| AF-01 | Work intake and planning | Turn objectives into scoped tasks, dependencies and acceptance criteria |
| AF-02 | Architecture review | Assess boundaries, trade-offs and ADR compliance |
| AF-03 | Coding and refactoring | Implement bounded changes with tests |
| AF-04 | Automated PR review | Detect defects, security, performance and architectural issues |
| AF-05 | Test generation | Add unit, integration, contract and regression coverage |
| AF-06 | AI evaluations | Measure retrieval, generation, agent success and safety |
| AF-07 | Failure triage | Analyse CI failures, flaky tests and root causes |
| AF-08 | Durable knowledge | Maintain verified lessons, ADRs and progress |
| AF-09 | Improvement proposals | Propose instruction, prompt, tool and workflow updates via PRs |
| AF-10 | Agent benchmarking | Compare configurations on fixed tasks and metrics |
| AF-11 | Specialist orchestration | Coordinate planner, coder, reviewer, security and evaluator roles |
| AF-12 | Security and permissions | Scan secrets, dependencies, prompt injection and tool access |
| AF-13 | Cost optimisation | Track tokens, execution time, model spend and Azure resources |
| AF-14 | Observability | Trace actions, outcomes, errors, latency and cost |
| AF-15 | Continuous maintenance | Identify documentation drift, dependency issues and technical debt |
| AF-16 | Scheduled bounded operations | Run approved periodic checks and create actionable reports/PRs |
| AF-17 | Governance and audit | Enforce human approvals, immutable evidence, rollback and policy checks |
| AF-18 | Optional fine-tuning research | Evaluate whether model training improves results beyond prompt/tool changes |

## Implementation waves

### Wave 0 — Foundation
Define events, evidence schema, evaluation fixtures, permissions, audit records, budgets and success metrics. Document guardrails and establish a baseline. No autonomous writes.

### Wave 1 — Observe and review
CI-based PR reviews, test and security reports, failure categorisation, and a scheduled weekly improvement report. Initially read-only/report-only. Evaluate precision and noise before gating merges.

### Wave 2 — Propose and validate
Generate improvement proposals as draft PRs. Benchmark proposed prompts/instructions against fixed tasks, compare with baseline, run regression checks and require human review.

### Wave 3 — Assisted execution
Introduce task planning, bounded implementation, specialist roles and automated test generation. Require human approval for merges and consequential actions.

### Wave 4 — Controlled autonomy
Allow narrowly scoped, low-risk maintenance with allowlisted actions, least-privilege credentials, concurrency limits, time/token budgets, rollback and audit logs. Escalate anything outside policy.

### Wave 5 — Optimisation and research
Optimise agent routing, reliability and cost. Investigate fine-tuning only if evaluations justify it.

## Promotion criteria for each capability
1. Objective and measurable baseline defined.
2. Reproducible tests and evaluation dataset exist.
3. Safety boundaries and permission scope documented.
4. Cost ceiling and failure/rollback procedure documented.
5. Proposed change improves metrics without unacceptable regressions.
6. Human approval for policy changes, merges, deployments and chargeable Azure operations.
7. Results, limitations and decisions recorded in version control.

## Non-negotiable constraints
- Never let an agent silently weaken AGENTS.md, security policy, approval gates or evaluation criteria.
- Do not provision chargeable Azure resources without explicit approval; every cloud exercise needs scoped cleanup.
- Use synthetic or approved data; no secrets in repository or logs.
- Separate evaluation evidence from agent-generated claims; verify independently.
- Avoid self-reinforcing feedback loops: hold out benchmark cases and review false positives.
- Scheduled jobs must have bounded execution, budget and permissions; report failures rather than hiding them.

## Initial milestones
- [x] Roadmap and governance intent documented.
- [ ] Add evidence/event schema and baseline metrics.
- [ ] Add report-only PR review workflow.
- [ ] Add weekly review workflow with actionable report.
- [ ] Add evaluation harness and fixed benchmark tasks.
- [ ] Add draft improvement PR generator.
- [ ] Introduce specialist agents and controlled automation after measured success.

See root AGENTS.md and docs/PROGRESS.md for repository-wide rules and status.
