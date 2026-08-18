---
schema: pipeline.backlog-item.v1
id: pipeline.guard-lifecycle-allowlist-should-derive-from-the-onboarding-cli-table
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-16
source: "Critic review of commit 15cf0e58, 2026-08-16: governance checklist item 8 requires a named owner and expiry date for the deferred Direction 2 systemic fix named in backlog/items/2026-08-16-lifecycle-guard-omits-the-partial-authority-repair-it-prescribes.md"
due: 2026-08-30
---

# Derive the guard's admitted read-only `plan*` command set from the onboarding CLI's own table

## Description

`guard-lifecycle-ready.mjs`'s `sanctionedOnboardingArgs()` admits a
hand-maintained array of read-only `plan*` subcommand names
(`"plan"`, `"plan-runtime"`, `"plan-reinstall"`, `"plan-repair"`,
`"plan-readback"`, `"plan-source-recovery"`, `"plan-manifest-repair"`,
`"plan-partial-authority"`). This is the third time a real, read-only
subcommand of `lib/project-onboarding-v3.mjs` /
`scripts/project-onboarding-v3.mjs` has been missing from this exact list —
see `backlog/items/2026-08-08-the-guard-refuses-the-recovery-the-inspection-prescribes.md`
(the general pattern), `backlog/items/2026-08-09-guard-lifecycle-ready-runner-allowlist-incomplete.md`
(a different entry missing from the same list), and
`backlog/items/2026-08-16-lifecycle-guard-omits-the-partial-authority-repair-it-prescribes.md`
(this item's own "Direction 2", which named this fix but deferred it without
an owner or expiry date attached).

## Triggering situation

Filed to close a governance-checklist gap: a Critic review of commit
`15cf0e58` (which added the missing `plan-partial-authority` entry — Direction
1 of the original item) found that Direction 2 was named but left with no
owner and no expiry date, violating `governance/examples/policies/checklist.md`
item 8 ("every known gap intentionally NOT fixed in this change has a named
owner and an expiry date attached ... a risk 'documented' without owner+date
is itself a finding, not a mitigation").

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
(`sanctionedOnboardingArgs()`), and by extension whichever registered
subcommand table it should read from in
`plugins/pipeline-core/lib/project-onboarding-v3.mjs` /
`plugins/pipeline-core/scripts/project-onboarding-v3.mjs`.

## Proposal

Derive the guard's admitted read-only `plan*` command set from the onboarding
CLI's own registered subcommand table (e.g. `APPLY_SHAPED_COMMANDS` in
`scripts/project-onboarding-v3.mjs:28`, or a dedicated read-only command
registry exposed by `lib/project-onboarding-v3.mjs`/
`scripts/project-onboarding-v3.mjs`), instead of a fourth hand-maintained
array entry the next time a `plan*` subcommand is added. The derivation must
key on a declared read-only property of each entry, not on the `plan` name
prefix — a future WRITING subcommand that happens to share the prefix must
not be silently admitted just because it matches the naming convention. This
correctness hazard is exactly what the original item's own "Direction, not a
design" section flagged and is why this is design work, not a same-session
patch.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — deferred to a dedicated design round.
- **Rationale:** touches `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`, a guardrail hook — Design-tier model and mandatory Critic escalation apply (MP-07). Changing how the guard's admitted command set is derived (rather than adding one more literal to it) is guardrail-class design work, not proportionate to design and implement inline as part of a citation-and-governance fix.
- **Assignment (if accepted):** future dedicated design session.
- **Date:** 2026-08-16

### Dispatch confirmation, 2026-08-18

**Decision:** Confirmed queued for dispatch, current scope, not deferred —
the 2026-08-16 "future dedicated design round" language did not name a
specific still-open sprint, so it does not qualify as correctly deferred
under the 0.6.0 release bar. Bounded scope unchanged from the existing
Proposal: derive `sanctionedOnboardingArgs()`'s admitted `plan*` set from a
declared read-only property on the onboarding CLI's own subcommand table,
never from the `plan` name prefix alone. **New cross-reference to weigh at
design time:**
`2026-08-17-plan-partial-authority-guard-allowlist-does-not-admit-its-own-profile-source-flags.md`'s
own 2026-08-17/2026-08-18 record found that the guard's current narrow
admission (only the exact automated `nextAction` shape, not the full
human-invoked CLI surface) is a deliberate, twice-Critic-reviewed
defense-in-depth choice, not an oversight — so "derive from the CLI table"
must preserve that read-only/automated-shape distinction rather than
mechanically widening admission to everything the CLI table lists as
read-only. Guardrail-tier code — MP-07 design-tier model plus mandatory
Critic review apply; not attempted in this read-only triage pass.
- **Date:** 2026-08-18
