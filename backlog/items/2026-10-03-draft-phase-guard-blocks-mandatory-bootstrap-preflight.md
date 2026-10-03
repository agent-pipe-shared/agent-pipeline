---
schema: pipeline.backlog-item.v1
id: pipeline.draft-phase-guard-blocks-mandatory-bootstrap-preflight
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Manual observation, Claude Code session on Windows, 2026-10-03, feat/sprint-alfred at a0d83ce78, active feature sprint-alfred-epic in lifecycle draft."
sprint: alfred
done_when: manual
---

# Draft-phase dev-plan gate blocks the mandatory bootstrap preflight

## Description

While the active feature is in lifecycle `draft`, the guard refuses the exact
bootstrap command that `pipeline-core:pipeline-start` mandates:

- `node "<installed-plugin-root>/scripts/pipeline-start-preflight.mjs"` gives
  `GUARD-DEVPLAN-SHELL`, lane `opaque-script-execution`,
  `File: .pipeline-opaque-execution`.
- `node "${PIPELINE_PLUGIN_ROOT}/scripts/pipeline-start-preflight.mjs"` (the
  skill's literal spelling) is refused the same way, with the unexpanded
  variable reported as the file.

The only route offered is a signed one-use human override. The result is a
bootstrap deadlock. No Elephant can reach the confirmation line, and therefore
no Elephant can perform the sanctioned draft-phase work (`submit-plan`, design
review) that would lift the gate. A read-only, plugin-owned preflight is not
implementation and must not fall into the opaque-execution write lane.

Follow-up evidence, same session: the PO ran the identical preflight directly
from the prompt (outside the agent's tool hooks). It returned
`hook-provisioning-required` (`HOOK-READINESS-INSTALL-REQUIRED`: missing
`pre-commit` and `commit-msg` hooks; the clone report also lists an absent
`pre-push` hook and an `invalid` PO profile receipt). Its `nextAction` is
`clone-hook-readiness.mjs --root <root> --apply` at boundary `default`, an
action the Elephant is supposed to execute but which the same gate also refuses.
Two gaps follow. First, `pipeline-start/SKILL.md` lists the statuses a
preflight may accept and does not name `hook-provisioning-required`, so the
handling of this status is undocumented. Second, a freshly reset clone cannot
self-provision while a feature is in draft.

Narrowed later in the same session: the identical preflight, spelled with the
Windows-native backslash plugin path (`node "D:\...\pipeline-start-preflight.mjs"`),
is admitted for the agent, and so are the backslash-spelled `nextAction`
commands. Only the forward-slash spelling and the skill's literal
`${PIPELINE_PLUGIN_ROOT}` spelling fall into the opaque-execution lane. The
defect is therefore spelling-sensitive admission, not a full deadlock. Note,
though, that the form the skill prescribes is one of the refused spellings.

## Triggering situation

Session re-entry per `docs/0.7-recovery-2026-10-03.md` with Alfred in
`design`/`draft`, `planApproved: false`.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` /
`guard-devplan` shell lane classification;
`plugins/pipeline-core/skills/pipeline-start/SKILL.md` command contract.

## Proposal

Admit the exact installed-plugin bootstrap and lifecycle read commands
(preflight, `project-onboarding-v3.mjs inspect`,
`observation-governance-bootstrap.mjs`, `pipeline-state.mjs inspect`) by
closed argv identity, bound to the resolved plugin root, in every lifecycle
phase. Add a regression test with a draft-phase fixture that requires the
bootstrap sequence to run to a ready confirmation without an override.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
