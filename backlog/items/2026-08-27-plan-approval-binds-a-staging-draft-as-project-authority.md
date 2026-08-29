---
schema: pipeline.backlog-item.v1
id: pipeline.plan-approval-binds-a-staging-draft-as-project-authority
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Live state of a greenfield Antigravity test project, read 2026-08-27: the PO plan approval bound project/.onboarding-staging/ paths as project authority and advanced the feature to implementation. The generated staging files' own banner states they must not be bound as authority."
done_when: manual
---

# The plan-approval path binds a pre-authority staging draft as project authority, and every downstream check then agrees with it

## Description

A greenfield project onboarded on 2026-08-27 reached `phase: implementation`
with `planApproved: true` and a complete `pipeline.plan-approval.v4` record —
while every authority pointer in its state file names a staging path:

```
"authority": {
  "prd":  { "path": "project/.onboarding-staging/prd_onboarding-<id>.md" },
  "spec": { "path": "project/.onboarding-staging/spec.md" }
}
```

There is no `specs/` directory in that project at all. The promotion step that
moves a reviewed design package to `specs/<feature>/` never ran, and nothing
required it to.

Both bound files are deterministic generated drafts. Their body is the captured
chat input reproduced verbatim under the heading
`## Captured material input (verbatim, in capture order)`. Their own generated
banner says, in the file that was bound:

```
do not hand-edit -- this staging file is NOT yet bound as project authority
```

The PRD additionally carries `po-plan-acknowledged: content-sound-and-spec-consistent`.

## Why this matters more than a misplaced file

The staging location is not the defect — it is deliberate and correctly labelled.
The defect is that the plan-submission/plan-approval path accepts a document
explicitly marked as pre-authority AS the authority, and every gate downstream
then reports consistency, correctly, because everything is consistently bound to
the same placeholder.

The consequence is that the PRD/Spec quality bar documented in
`plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md` never
applied to this project: no authoring step, no review step, no promotion. The
delivered product was good, but it was governed by a transcript of the request
rather than by a specification. The pipeline's central claim — that it governs
the design, not merely records it — was not exercised, and nothing said so.

This is the same failure shape as the other 2026-08-27 findings: a control that
reports green while doing nothing. Here it sits on the step that carries the
pipeline's actual value.

## What was checked, and what was not

Checked directly against the live project state and the bound files. Not
checked: whether the `bootstrap-bind-apply` route (which does enforce promotion,
per `plugins/pipeline-core/lib/onboarding-continuity.mjs`) is reachable from the
same starting point, i.e. whether this project took an alternative path by
accident or whether the plan-approval route is simply the ordinary one for a
kickoff with material design input. That distinction decides whether the fix is
a missing precondition on approval, a missing route, or a wrong default.

A prior read-only investigation of this same question (`NVA-INV-STAGING-1`,
2026-08-27) concluded the opposite — that promotion is mandatory by construction
— from reading the `bootstrap-bind-apply` path alone. The live state refutes
that conclusion. Recorded here because the error is instructive: the code path
that enforces the rule existed and was read correctly; the path the project
actually took was a different one.

## Proposal

Not designed here. The shape of any fix is constrained by one question above:
the approval path must refuse to bind a document that declares itself
pre-authority, or the promotion step must be a precondition of approval rather
than an alternative route. A cheap first guard, independent of that decision: an
approval whose `planPath` or `specPath` resolves inside the staging directory is
refused with a typed reason naming the promotion action.

## Affected artifact

- `plugins/pipeline-core/scripts/pipeline-state.mjs` (the plan-submission and
  plan-approval writers)
- `plugins/pipeline-core/lib/onboarding-continuity.mjs` (staging generation and
  the promotion transaction)
- `plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md`
  (the quality bar that was never reached)
- `roles/elephant.md` (the `specs/<feature>/prd_<topic>.md` location contract)

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, and fixed by removing the staging location rather than
  by guarding the approval path. PO decision 2026-08-27, chosen from three
  options presented (keep staging and fix ordering / remove staging / collapse
  the whole intake chain).
- **Rationale:** the item's own analysis names the real constraint — either the
  approval path refuses a self-declared pre-authority document, or promotion
  becomes a precondition of approval. Both accept the premise that two kinds of
  "design document" exist. `intake-generate-apply` now writes straight into
  `specs/<featureId>/` (`1c264e28`), so there is no pre-authority draft, no
  promotion step to skip, and no second route that can bind the wrong thing.
  Approval binding a `specs/` path is now simply correct. The cheap guard this
  item proposed as a first step was deliberately NOT built: it would have
  defended a distinction that no longer exists.
- **Assignment (if accepted):** substantially delivered in `1c264e28`. Stays
  `open` for one remaining step: GS-15, its TP-6-protected regression test
  GST38, and the transitional legacy branch in `onboarding-staging-authoring.mjs`
  must be removed together, which needs one signed author-repair override. Exact
  steps in `scratch/NVA-INTAKESPECS-1-UMSETZUNG.md`.
- **Date:** 2026-08-27
