---
schema: pipeline.backlog-item.v1
id: pipeline.a-fresh-clone-loses-all-machine-local-pipeline-state-with-no-provisioning-readback
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Measured 2026-08-27 in the Alfred clone (fresh clone of the Nova line): each missing machine-local artifact surfaced as an isolated refusal at a different lifecycle point, none at bootstrap."
---

# A fresh clone loses all machine-local Pipeline state, and every gate discovers it one refusal at a time

## What was measured

Cloning a governed repository copies the tracked tree but none of the
Pipeline's machine-local state under `.git/`. In the Alfred clone this
surfaced as three independent, temporally scattered discoveries:

1. **Pre-push hook absent** — noticed only because the session checked
   proactively; installed manually on PO request (2026-08-27, recorded in
   `docs/state.md`).
2. **PO-profile receipt absent** — surfaced hours later as
   `PO-PROFILE-RECEIPT-INVALID` at the first `submit-plan`, repaired via
   the typed route (`setup.mjs --publish-po-profile`). The receipt is
   deliberately machine-local (git common dir, mode 0600) — correct
   design, but nothing re-provisions it after a clone.
3. **Continuity object absent** — partially a clone artifact (the epic
   switch deleted it), tracked separately as the `set-feature` →
   `submit-plan` gap item filed alongside this one.

Bootstrap (`pipeline-start-preflight`, onboarding inspect) reported `ready`
throughout: no check enumerates machine-local provisioning health, so a
clone looks healthy until each dependent gate individually refuses.

## The defect, precisely

There is no "provision this checkout" step or readback: the set of
machine-local artifacts a working checkout needs (hooks, receipts, private
state directories) is implicit in the individual guards that consume them.
The cost profile is bad exactly for the multi-machine/clone workflow the
repo explicitly supports (CLAUDE.md: "this repo runs on two machines").

## Affected artifacts

- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` /
  onboarding inspect (report `ready` without machine-local provisioning
  checks)
- `setup.mjs` (owns receipt publication; no aggregate provisioning verb)
- git hooks installation flow (manual today; A2's placement policy in
  `specs/sprint-alfred-epic/spec.md` §4.2 already plans "onboarding offer
  becomes a default-on step with decline recorded" for the pre-push hook)

## Proposal (not designed here)

A single idempotent provisioning readback — e.g.
`setup.mjs --provision-checkout` or a bootstrap check row — that
enumerates: hook presence/identity, PO-profile receipt validity, private
state directory health; reports each as `present | absent | stale` with
its typed repair; writes nothing without the existing per-artifact
routes. Fits Track A's enforcement-honesty theme (a control that silently
depends on unprovisioned machine-local state is `prose`-enforced in
practice).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
