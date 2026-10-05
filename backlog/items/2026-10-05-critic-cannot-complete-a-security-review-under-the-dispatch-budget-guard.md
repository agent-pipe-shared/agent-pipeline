---
schema: pipeline.backlog-item.v1
id: pipeline.critic-cannot-complete-a-security-review-under-the-dispatch-budget-guard
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Live observation 2026-10-05 (Alfred session): perf and readiness Critic rounds went partial; ALFRED-BACKLOG-20261005 defect 1."
sprint: alfred
done_when: manual
---

# Critic cannot complete a security review under the dispatch-budget guard

## Description

The guard-dispatch-budget enforces a working cap of 12 tool uses for a Critic (min(base, maxTurns 30 - 5 - 10)), while `templates/prompts/critic-review.md` states a base cap of 24 (+5). Guard refusals, including read-scope false positives, consume the same budget (5 of 13 attempts in one round). The guard's closing lane admits only dispatch-record writes, `git add` and `git commit`, so the Critic's own notes write (CR-06-D durability duty) is refused. Net effect: a Critic cannot finish a security-class review and returns partial.

## Triggering situation

Perf Critic and readiness Critic rounds on 2026-10-05 ended partial with pass/fail withheld. Commits db17cafa4 (notice, Critic notes lane for Write/Edit, grant script) and 047e48efb (Critic maxTurns 30 to 40) fix part of it.

## Affected artifact

`plugins/pipeline-core/hooks/guard-dispatch-budget.mjs`, `plugins/pipeline-core/agents/critic.md`, `templates/prompts/critic-review.md`.

## Proposal

Remaining gap: a Bash-based notes write is not admitted in the closing lane; decide whether to admit a bounded form or document Write/Edit as the only route. Template and guard must state one number. Related read-scope false positives are tracked in `2026-10-03-claude-windows-guard-refuses-every-in-repo-read.md`; the source-vs-installed conflict introduced by the maxTurns change is `2026-10-05-source-agent-definition-change-locks-that-agent-until-install.md`. Verification: a Critic dispatch with a security-class diff completes and persists its notes.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
