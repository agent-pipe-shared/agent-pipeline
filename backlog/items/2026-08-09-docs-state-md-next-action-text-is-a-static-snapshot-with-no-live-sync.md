---
schema: pipeline.backlog-item.v1
id: pipeline.docs-state-md-next-action-text-is-a-static-snapshot-with-no-live-sync
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Live Codex+Pipeline 0.5.4 greenfield test session, 2026-08-09 (three rollout files): docs/state.md said 'submit the plan for PO approval' while project/pipeline-state.json's activeFeature.phase was already 'implementation' and planApproved was already true. Confirmed by direct code reading against plugins/pipeline-core/lib/onboarding-continuity.mjs."
due: 2026-08-23
---

# A consumer project's `docs/state.md` "Next action" text is written once at kickoff/promotion and never kept in sync with later `pipeline-state.mjs` commands

## What happened

`onboarding-continuity.mjs`'s `handoverContent()` (kickoff) and
`promotionHandoverContent()` (promotion) each write a STATIC "## Next
action" paragraph into `docs/state.md` — e.g. "Review the PRD and
specification, then submit the plan for PO approval... Implementation
writes stay refused until the plan is approved and the phase is switched to
`implementation`." This text is correct at the moment it is written, but
nothing updates it afterward: once `submit-plan`, `approve-plan`,
`set-phase`, or any later `pipeline-state.mjs` command actually changes
`activeFeature.phase`/`planApproved` in `project/pipeline-state.json`,
`docs/state.md` is never touched again. Live-confirmed: a real session's
`docs/state.md` still said "submit the plan for PO approval" while the
machine state it should describe already showed
`activeFeature.phase: "implementation"` and `planApproved: true` — a
directly contradictory pair read side by side in the same session.

## Why this needs a dedicated design pass, not a quick patch

Two structurally different fixes exist, both nontrivial:

1. **Regenerate `docs/state.md`'s "Next action" section from live state** on
   every `pipeline-state.mjs` command that changes phase/approval status —
   this means auditing and touching every relevant call site in a large,
   already-dense file (`submit-plan`, `approve-plan`, `set-phase`,
   `reopen-design`, `close-feature`, and more), each needing to know how to
   render the CURRENT correct "Next action" text for the state it just
   produced. Risk: an incomplete audit leaves SOME transitions still
   updating it and others not, which could look more consistent than it is.
2. **Make `docs/state.md` a generated/derived view** computed on demand
   (e.g., by a `docs-state` inspection command) rather than a file agents
   read directly for authority — a bigger interface change to how sessions
   are told to consult project state at all.

Given the size and risk of either option, this is being filed rather than
attempted as a same-night patch, per this session's explicit
already-established practice of deferring genuinely large architectural
changes instead of a rushed partial fix.

## Direction

PO/Elephant decision needed on which of the two shapes above (or a third) to
pursue. In the meantime, a smaller, safe mitigation was applied directly
this session: the initial "Next action" text in both `handoverContent()` and
`promotionHandoverContent()` now includes an explicit caveat that the
machine-readable `project/pipeline-state.json` (or `pipeline-state.mjs
continuity-status`) is the live, authoritative source if this text looks
stale — reducing false confidence without attempting the larger sync
mechanism. See the same-session commit for the caveat wording.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
