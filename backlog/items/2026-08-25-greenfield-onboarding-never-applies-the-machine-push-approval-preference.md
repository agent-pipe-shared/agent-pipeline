---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-onboarding-never-applies-the-machine-push-approval-preference
type: defect
owner: pipeline
status: open
created: 2026-08-25
source: "PO question (chat), 2026-08-25: 'im onboarding muss ... auch der blocking mode also chat oder signature abgefragt werden. Das fehlt aktuell noch' -- investigated directly against plugins/pipeline-core/lib/project-onboarding-v3.mjs by the Elephant"
---

# Greenfield onboarding asks the push-approval preference once per machine, but never applies the answer to a new repository's `pipeline.user.yaml`

## Description

The PO observed that a greenfield onboarding run never seemed to ask which
push-approval mode (`chat` vs `signature`) to use, and suspected the pipeline
might be wrongly refusing per-repository config that legitimately differs
from some "original" baseline.

Investigated directly. Two separate, more precise findings, neither matching
the PO's own hypothesis exactly:

1. **The question exists, but is not part of the documented kickoff
   question set.** `collectPushApprovalPreferenceAction()`
   (`project-onboarding-v3.mjs:4246`) is real and asks exactly the right
   thing (chat vs. signature, PO key directory if signature). It fires only
   through `unresolvedMachinePushApprovalSetup()`
   (`project-onboarding-v3.mjs:4295`), which is true exactly when THIS
   MACHINE's `machine-plane.mjs` configuration has never been written --
   "once per machine," not once per repository, and not bundled with the
   two documented kickoff questions (language, profile;
   `plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md`
   names only those two). On any machine that has already onboarded one
   project, this question silently never fires again -- which is very
   plausibly why the PO's own greenfield run appeared not to ask it at all.

2. **The real gap: even when asked and answered, the answer is never
   applied.** `freshIntent()` (`project-onboarding-v3.mjs:870`, the function
   that generates a NEW project's `pipeline.user.yaml`) hardcodes
   `gates.push_approval: "signature"` unconditionally at line 914 -- it never
   reads `machine-plane.mjs`'s remembered preference. Both call sites
   (`planProjectPartialAuthorityAdoption` line 465, and
   `applyProjectPartialAuthorityAdoption` line 500) call `freshIntent()` and
   write its bytes verbatim via `renderYaml(intent)` with no merge step. The
   PO's actual "chat" answer, if given, is recorded ONLY in
   `machine-plane.mjs`'s `machine.json` (so the question is not re-asked) and
   in the guidance TEXT shown to the agent
   (`collectPushApprovalPreferenceAction`'s `guidance` string: "write the
   chosen mode into this repository's committed gates.push_approval in
   pipeline.user.yaml") -- a manual follow-up instruction with no DoD check,
   no automatic write, and nothing that verifies the agent actually did it.

Checked the PO's own specific hypothesis (a staleness/freshness check
refusing `pipeline.user.yaml` values that deviate from a canonical
"original," rather than only checking that required keys are present): no
such check was found. The bootstrap ruleset-staleness check concerns canon
files (guardrails/roles/templates), not this project-local config file's
configured values. The actual root cause is the wiring gap above, not a
false-positive staleness refusal.

## Impact

Low-severity by construction: the unconditional default is `signature`, the
FAIL-CLOSED/strictest option (ADR-0056) -- a project a PO wanted seeded
`chat` silently stays `signature` instead, which is safe-direction wrong, not
exploitable-direction wrong. But it means the machine-scoped question
(`collectPushApprovalPreferenceAction`) currently has no effect on the
generated repository at all unless an agent happens to notice the guidance
text and hand-edits `pipeline.user.yaml` afterward -- unverified, undriven by
any check.

## Proposal

`freshIntent()` (or its caller, before `renderYaml`) should read
`machine-plane.mjs`'s resolved push-approval preference, when valid, and seed
`gates.push_approval` from it instead of the unconditional literal
`"signature"` -- falling back to `"signature"` only when the machine plane is
absent/invalid (i.e. exactly the situation where the question is about to be
asked anyway). Separately, consider whether `collectPushApprovalPreferenceAction`
belongs in the documented kickoff question set alongside language/profile
(`kickoff-design.md`) rather than as an undocumented machine-scoped
side-channel -- a PO reading that reference today has no way to learn this
question exists at all.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** low-severity (fails safe-direction), not blocking any
  currently active work; investigated and recorded precisely so a future
  session does not have to re-derive the two call sites and the exact line
  numbers again.
- **Assignment (if accepted):** unscheduled.
- **Date:** 2026-08-25
