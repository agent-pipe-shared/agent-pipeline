---
schema: pipeline.backlog-item.v1
id: pipeline.hgo-cli-side-granted-wiring-conflicts-with-arm-time-drift-check
type: requirement
owner: pipeline
status: closed
created: 2026-08-19
closed_at: "2026-08-23"
closure_repository: "self"
closure_commit: "887ac164e61fdb81effe8de50e2464ff95753e6c"
closure_evidence: "plugins/pipeline-core/lib/human-guard-override.test.mjs"
source: "Split out of backlog/items/2026-08-07-gmw-hgo-evidence-must-reach-the-phoenix-audit-ledger.md at its close (2026-08-19) -- that item's HGO hook-side (denial+consumption) ledger emission landed and is tested; its CLI-side (granted) wiring hit a genuine architectural conflict, was correctly reverted, and needs a design review rather than a fourth goldfish-scale dispatch on the same file."
---

## Closed — 2026-08-23

PO Decision (Option 1) implemented: `filterGovernanceEventsStatus` in
`plugins/pipeline-core/lib/human-guard-override.mjs` excludes
`governance/events/**` from the `statusSha256` drift-check preimage, so a
fail-closed ledger append before arming no longer trips `HGO-DRIFT`. Source,
config and spec paths remain fully covered. Verified with unit test coverage
in `plugins/pipeline-core/lib/human-guard-override.test.mjs`.

# HGO's CLI-side `granted` ledger emission cannot be added without breaking arm-time drift detection

## Description

`scripts/guard-human-override.mjs`'s `authorize`/`authorize-by-signature` subcommands
are the CLI-side counterpart to the hook-side `requested`/`denied`/`consumed`
ledger emission that already landed (`025f9e1a`, `bce05e53`) for
`hooks/guard-gate-strength.mjs`. Wiring the matching `granted` emission was
attempted (`PHX-WP-HGO-LEDGER-EMISSION-V3`) and hit a real architectural
conflict, proven live via a full deny→authorize→consume round-trip test,
then correctly reverted rather than ship a regression:

`specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md`
§8.1 requires arming (HGO `granted`) to be fail-closed -- the ledger append
must happen, and succeed, BEFORE the capability is armed. But
`appendHumanGovernanceDecision` writes into the tracked worktree without
committing, and `authorizeHumanGuardOverride()`/
`authorizeHumanGuardOverrideBySignature()` (`plugins/pipeline-core/lib/human-guard-override.mjs`)
independently re-derive `repositoryObservation` (including `statusSha256`)
at arm time and refuse `HGO-DRIFT` the instant that status differs from what
was captured at denial time. Appending-before-arming therefore breaks arming
for every representable decision.

## Affected artifact

`plugins/pipeline-core/scripts/guard-human-override.mjs` (the CLI subcommands
that would need the emission), `plugins/pipeline-core/lib/human-guard-override.mjs`
(`authorizeHumanGuardOverride`/`authorizeHumanGuardOverrideBySignature`'s
`repositoryObservation`/`statusSha256` drift check), `plugins/pipeline-core/lib/human-governance-ledger.mjs`
(`appendHumanGovernanceDecision`'s worktree-write-without-commit behavior),
`specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md`
§8.1 (the fail-closed-arming requirement this conflicts with).

## Proposal

**Owner: PO / design review.** Three candidate directions were surfaced by the
reverted dispatch, unevaluated -- this is a security-critical-file design
decision, not a scoping or implementation gap a tighter briefing would fix:

1. Exclude `governance/events/**` from the drift-relevant `statusSha256`
   preimage, so a ledger append doesn't itself trip the drift check it is
   trying to record.
2. Make the ledger append commit atomically (so the append is a durable,
   committed state transition rather than an uncommitted worktree write the
   drift check can observe mid-flight).
3. Thread the pre-append repository observation through to the arm call
   instead of re-deriving a fresh one at arm time (the arm call trusts the
   observation captured before the append, rather than re-observing after).

None of these were designed or evaluated in the reverted dispatch; whichever
direction the PO picks needs its own design pass before a Goldfish dispatch
attempts it a fourth time on this file.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted Option 1 — exclude `governance/events/**` from the `statusSha256` drift check preimage.
- **Rationale:** Decouples uncommitted governance audit events from the code-drift verification at arm time without weakening protection against modifications to source code, configs, or specs. All governance ledger events continue to be tracked, committed, and pushed.
- **Assignment (if accepted):** `plugins/pipeline-core/lib/human-guard-override.mjs` and `plugins/pipeline-core/lib/human-guard-override.test.mjs`.
- **Date:** 2026-08-23
