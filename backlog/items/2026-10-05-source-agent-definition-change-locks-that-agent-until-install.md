---
schema: pipeline.backlog-item.v1
id: pipeline.source-agent-definition-change-locks-that-agent-until-install
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Live observation 2026-10-05 (Alfred session), scratch IC-2 plan; ALFRED-BACKLOG-20261005 defect 9."
sprint: alfred
done_when: manual
---

# A source-tree agent definition change locks that agent until the plugin is installed

## Description

After commit 047e48efb raised `agents/critic.md` `maxTurns` from 30 to 40 in the source tree, every Critic dispatch was refused at its first tool call with `DISPATCH-BUDGET-INPUT-INVALID ... budget-tier-max-turns-conflict`. `guard-dispatch` binds the base cap from one agent definition, while `guard-dispatch-budget` re-reads `maxTurns` from the INSTALLED plugin (still 30). In the Pipeline's own repository any agent-definition change therefore locks that agent until install.

## Triggering situation

Reproduction shape: change `maxTurns` in a source `agents/*.md`, do not install, dispatch that agent. Impact: Critics blocked until a stamp and install cycle completes; the fix for the Critic budget (see `2026-10-05-critic-cannot-complete-a-security-review-under-the-dispatch-budget-guard.md`) cannot be tested before it ships.

## Affected artifact

`plugins/pipeline-core/hooks/guard-dispatch.mjs`, `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs`.

## Proposal

Both guards should read the same (installed) definition, or the binding should record the `maxTurns` it used and the budget guard should honour the recorded value. Add a regression test with source and installed definitions differing.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `337492443`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
