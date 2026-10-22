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

## Evidence 2026-10-22 (the two budget-spending classes)

- counter-lock-busy: no longer a refusal. The guard waits (bounded, 3000 ms) for a live holder and admits and counts every
  parallel call exactly once; a wait that times out is refused under `DISPATCH-BUDGET-COUNTER-LOCK-TIMEOUT` with "this call
  was not counted". Owned by `plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs` (R7-11a..d, T3, T4): 127 cases,
  125 pass, 0 fail, 2 skip (the two win32-only cases), `node --test`, Linux host.
- rg/Glob/Grep read-scope: the Critic read shapes (native Read, Grep on an exact file, Glob with a pattern, Bash `rg` on a
  directory, Bash `cat`) are admitted by the real read-scope check and each costs exactly one budget call; pinned as E1 in
  `plugins/pipeline-core/lib/pins/critic-cannot-complete-a-security-review-under-the-dispatch-budget-guard.test.mjs`
  (8 cases, 8 pass, 0 fail, 0 skip). Native Grep on a directory is refused by PO decision 2026-10-16 (exact-file rule), and
  such a refusal still spends a call; the Bash `rg` route is the admitted equivalent.
- Not verified: the item's own verification line (a live Critic dispatch with a security-class diff completes and persists
  its notes) needs a real dispatch and is not producible by an agent test.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

## Observed again 2026-10-05

Critic guard false positives consumed about 40 % of the Critic budget. The
observed classes: counter-lock-busy on parallel calls, rg/Glob/Grep refusals,
no write route for critic-notes.md, and no CSPRNG primitive available to the
Critic. Deferred from round 3 of the signed bundle (commit `866be2139`).
