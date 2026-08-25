# The intake-generate/bootstrap-bind coordinator (a fresh repo's actual first path)

Load this when Step 0/V4 onboarding (`project-onboarding-v3.mjs inspect`)
reports `continuity.status: "absent-pristine"` and a `v4Inspection` status of
`intake-required`, `intake-design-questions-required`, or
`bootstrap-binding-required` — never `kickoff-required`. Since commit
`10e1b6a0` (2026-08-19, "route fresh-repo `v4Inspection` to the intake
coordinator"), a genuinely pristine repository (no prior kickoff transaction
ever ran) is routed HERE, not to the `kickoff plan`/`kickoff apply` path
`references/kickoff-design.md` documents. A repository already mid-kickoff
under the old model (`kickoff apply` already ran, `kickoff promote` has not)
is unaffected: its `continuity.status` is already `"valid"` by the time this
check runs, so it keeps following `kickoff-design.md` untouched. Read
`kickoff-design.md` first for the PO bootstrap questions and quality bar this
flow reuses; this file covers only what differs.

## Why two paths exist

The coordinator (`lib/onboarding-continuity.mjs`, Wave 4 onboarding
coordinator, `specs/wave4-onboarding-coordinator/design.md`) replaces
`kickoff plan`'s single-shot goal/profile prompt with a longer, structured
intake conversation — consent, one or more material-input captures, one
bundled round of design questions — before anything is written, then
deterministically derives a staging PRD/Spec/design-input package from that
already-durable conversation rather than asking the agent to draft it from a
short goal string. The final step then binds that staging package through
the exact same promotion transaction `kickoff promote apply` uses (see
"Handoff" below) — the two paths converge, they do not produce different
kinds of authority.

## Step sequence

Each step is a `v4Inspection` status with a `nextAction.guidance` string
already explaining what to ask/call; this table is the map connecting those
individually-scoped nudges into the whole flow, and the state each command
requires:

| `v4Inspection` status | checkpoint `transactionState` | command |
| --- | --- | --- |
| `intake-required` | absent, or consent not recorded | `intake-consent-apply --granted --git-author-name <name> --git-author-email <email> --language <de\|en> --profile <epic\|feature\|mini>` (fields already known may be omitted; filled on a later call) |
| `intake-required` | `collecting` | `intake-capture-apply --text <verbatim PO message>` — once per PO message, repeated until the PO signals they are done describing the project |
| `intake-design-questions-required` | `design-questions-pending` | `intake-design-questions-apply --answers-json <JSON array of {question, answer}>` — exactly ONE bundled round; a second round with different answers is refused |
| `intake-design-questions-required` | `ready-to-generate` | `intake-generate-plan --root <root>`, then digest-bound `intake-generate-apply` |
| `bootstrap-binding-required` | `generated` | `bootstrap-bind-plan --root <root>`, then digest-bound `bootstrap-bind-apply --plan-sha256 <sha256> --activate` |

The consent step asks for the same PO inputs `kickoff-design.md` requires
before any artifact is written — operator-facing language and PO profile —
plus the repository's git author identity, gathered together rather than as
a separate blocking question later.

## What `intake-generate-apply` writes, and where

`intake-generate-apply` deterministically derives and writes three files
under `project/.onboarding-staging/` (`INTAKE_STAGING_DIRNAME`,
`lib/onboarding-continuity.mjs`) — a pure function of the checkpoint's own
already-durable `consent`/`values`/`materialInput`/`designQuestions`, so a
crash at any point safely re-converges on replay:

- `design-input.md` — the verbatim captured material input. Immutable; never
  hand-edit (mirrors `kickoff-design.md`'s source-evidence rule for the
  promoted flow's own `design-input.md`).
- `prd_<featureId>.md` — a staging draft PRD. Already carries valid
  `<!-- po-language: xx -->` and `<!-- technical-spec-sha256: ... -->`
  markers; still needs product framing (What/Why/Scope/Non-goals/Risks/
  Alternatives/DoD) authored before binding.
- `spec.md` — a staging draft Spec, needing EARS acceptance criteria and
  implementation detail authored before binding.

`featureId` is `onboarding-<sha256(checkpoint.createdAt)[:12]>`
(`deriveIntakeFeatureId`), stable across regeneration so staging never
accumulates orphaned `prd_<old-id>.md` files as later captures/answers
change the checkpoint.

Both `prd_<featureId>.md` and `spec.md` are meant to be hand-authored and
reviewed before binding — this is the design's own intended review step, and
the guard (`hooks/guard-lifecycle-ready.mjs`, NVA-BL-INTAKEBIND-1) grants a
narrowly-scoped Edit/Write admission for exactly these two paths while the
session is observed at `bootstrap-binding-required`. `design-input.md` is
deliberately never admitted there — it stays immutable. The PRD also needs a
`po-plan-acknowledged` marker added as part of that review before
`bootstrap-bind-apply` can pass its plan gate (same guard admission covers
that edit).

`project/.onboarding-staging/` is not gitignored and its content is used
downstream by other tooling (backlog:
`2026-08-21-kickoff-untracked-files-missing-from-commits.md`) — stage and
commit it the same way `kickoff-design.md` already requires for `kickoff
apply`'s own written targets: an onboarding step reporting `applied`/staging
content ready is not actually done while its targets sit untracked.

## Handoff: `bootstrap-bind-apply` IS the kickoff-promotion transaction

`bootstrap-bind-apply` is not a separate binding mechanism. `lib/onboarding-
continuity.mjs`'s `planOnboardingBootstrapBind`/`applyOnboardingBootstrapBind`
call the exact same `buildKickoffPromotionPlan`/`applyOnboardingKickoffPromotion`
functions `kickoff promote plan`/`kickoff promote apply` use, with
`coordinatorSourced: true` — `resolveBootstrapBindInputs()` derives
`--profile`, the feature id, and the plan/PRD/Spec/design-input paths
directly from the already-durable intake checkpoint, so no separate operand
entry is needed. The result binds `docs/state.md` (or the configured
handover) plus the promoted `specs/<promoted-directory>/{prd_<short-topic>.md,
spec.md, design-input.md}` package, identically to a `kickoff promote apply`
result.

From the moment `bootstrap-bind-apply` reports `applied`, the project is on
the exact same rails `kickoff-design.md` documents for an already-promoted
package: the bound PRD/Spec is never edited merely to add richer
documentation; a material change follows the ordinary reviewed
planning/rebind path, not a document cleanup.

## Known gap this file does not fix

The private intake checkpoint's `transactionState` is never itself exposed
as a public `v4Inspection` status (design SSa.4's table); this reference
infers the mapping in the table above from the coordinator's own routing
logic (`project-onboarding-v3.mjs`, the `continuity.status === "absent-
pristine"` branch) as of commit `10e1b6a0`, not from a status field a session
can read directly. If that routing logic changes, this table needs updating
alongside it — nothing mechanically keeps the two in sync today.
