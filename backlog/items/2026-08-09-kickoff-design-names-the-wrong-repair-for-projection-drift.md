---
schema: pipeline.backlog-item.v1
id: pipeline.kickoff-design-names-the-wrong-repair-for-projection-drift
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Independent read-only analysis of the PO's private Claude+Pipeline 0.5.4 happy-path re-test (fifth local candidate), 2026-08-09, cross-checked directly against the transcript's actual command sequence and outcomes."
due: 2026-08-16
---

# `kickoff-design.md` tells an agent the wrong repair path for a `projection-drift` refusal, costing a full extra no-op repair round

## What happened

`references/kickoff-design.md` (lines 24-31) documents that two different
guard-drift refusals can hit the PRD-authoring step in a row — a
`PO-GATE-PRD-LANGUAGE-MISMATCH`, then a separate `projection-drift` refusal —
and states they "share the same repair path": run
`po-gate-profile-repair.mjs plan/apply --human-facing <de|en>` again for the
second refusal.

In the observed session, this is exactly what happened, and the documented
guidance was followed literally — with a fresh `po-gate-profile-repair.mjs
plan/apply --human-facing de` round after the first (correct) one had already
fixed the language mismatch. Because the language was already `de`, this
second round's own plan reported `{"from":"de","to":"de"}` — a genuine no-op.
An `inspect` run immediately afterward still reported
`"status":"projection-drift"` with the identical
`"code":"projection_drift","message":"generated runtime bytes differ from
the V3 projection"` diagnostic: the documented repair did not clear the
drift, because it never touches the actual runtime-manifest generation step
that is out of sync.

The refusal only cleared once the agent discovered, independently of the
doc, a *differently-named* tool and command pair:
`project-onboarding-v3.mjs plan-repair --root <project-root> --runner claude
--intent session` → `apply-repair --plan-sha256 <sha256> --activate`, which
succeeded on the first try and returned the session to `"ready"`.

## Why it matters

This is a full extra, wasted repair round-trip (a `plan` call, an `apply`
call, and a re-`inspect` to discover it didn't work) in an otherwise clean
run — directly the kind of "unnötige Reparaturschleife" the PO is trying to
eliminate from the happy path. The doc's guidance is not merely incomplete,
it is actively wrong for this refusal type: `po-gate-profile-repair.mjs`
repairs the PO-gate profile's declared language; `projection-drift` is a
different failure class (the generated runtime manifest bytes disagree with
what the current `pipeline.user.yaml` would project), fixed by a different
tool (`project-onboarding-v3.mjs plan-repair`/`apply-repair`), not by
re-running the same repair a second time.

## Direction

Correct `references/kickoff-design.md` lines 24-31: state that a
`PO-GATE-PRD-LANGUAGE-MISMATCH` and a `projection-drift` refusal are
DIFFERENT failure classes with different repair tools, not the same repair
path run twice. Name the correct pair for `projection-drift`:
`project-onboarding-v3.mjs plan-repair --root <project-root> --runner
<runner> --intent session`, then `apply-repair --plan-sha256 <sha256>
--activate`. Whoever implements this should verify the exact current argv
shape of `plan-repair`/`apply-repair` against `project-onboarding-v3.mjs`
directly rather than trusting this item's paraphrase.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
