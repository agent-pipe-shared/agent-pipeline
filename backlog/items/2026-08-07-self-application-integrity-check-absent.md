---
schema: pipeline.backlog-item.v1
id: pipeline.self-application-integrity-check-absent
type: defect
owner: pipeline
status: in_progress
source: merge report section 4 findings 7 and 9 (specs/sprint-phoenix-epic/evidence/merge-0.5.2-what-fell-away.md gitignored evidence artifact); merge commit 75b8361
created: 2026-08-07
---

# The self-application / public-marketplace-origin allowlist integrity check is gone

## Description

The 0.5.2 merge (`75b8361`, local only) dropped a paired mechanism:

- `plugins/pipeline-core/lib/codex-host-plugin-list.mjs` —
  `observeCodexRulesetSource`, which checked that a Codex ruleset's origin
  matched a self-application/public-marketplace allowlist.
- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` — the
  bootstrap-preflight wiring that invoked the check above during ordinary
  session start.

Both resolved to main's versions, which took the file in an unrelated
direction and dropped the integrity check respectively. The paired test
`plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs` now fails with a
`SyntaxError` (`observeCodexRulesetSource` no longer exported) — confirmed by
direct execution against the merged tree, not just a diff read.

## Triggering situation

Merge conflict resolution, code-conflict batch (28 files, origin/main taken
verbatim per PO's same-function policy). Test failure independently
reproduced in the merge's full 341-file direct sweep.

## Affected artifact

`plugins/pipeline-core/lib/codex-host-plugin-list.mjs`,
`plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs`,
`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`.

## Proposal

**Investigated (2026-08-07), not resolved — grew bigger than the original
framing.** A Goldfish-deep dispatch found that `pipeline-start-preflight.mjs`
is not a peripheral wiring point but part of the same broken chain: its
pre-merge `observePipelineStartPreflight` took `observeRulesetSource`
(`= observeCodexRulesetSource`) as a parameter and folded the self-application
origin-allowlist check directly into the bootstrap **readiness gate's
`status` decision** — not an additive field, a change to the core "is this
session ready to proceed" logic. That means a correct restoration is a
non-additive change to the bootstrap readiness gate itself, not a contained
fix to `codex-host-plugin-list.mjs`/`ruleset-freshness.mjs` alone — a design
decision needing PO sign-off before any code is written, given the blast
radius (every session's bootstrap).

Main's tree only **partially** covers the concern: `public-core-observation.mjs`
(`observeCodexPublicCoreIdentity`, `observePublicCoreIdentity`) and
`ruleset-source.mjs` (`normalizeRulesetSource`) still exist, unchanged and
still exercised — but only by the private-overlay activation path
(`private-overlay-activation.mjs:230,573`, `private-overlay-bootstrap-status.mjs:49`),
never by ordinary bootstrap. The `PUBLIC_SELF_APPLICATION_ORIGINS` allowlist
gate itself has no equivalent anywhere on main.

Open questions for the PO (see companion item
`2026-08-07-ruleset-freshness-wsl-subsystem-absent.md` for the closely
related freshness half of the same investigation):
1. Should the self-application origin-allowlist become part of ordinary
   bootstrap readiness again, reusing the existing (already-proven-safe)
   `public-core-observation.mjs`/`ruleset-source.mjs` primitives rather than
   reviving Phoenix's separate pre-merge API surface?
2. If yes, is changing the bootstrap readiness gate's `status` semantics
   (not just adding a field) an acceptable scope for this fix, or does it
   need its own dedicated design pass (mirroring how WP5/PHX-2 got one)?

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted (APS, 2026-08-07) — resume the self-application
  origin-allowlist check as part of ordinary bootstrap readiness, via the
  existing `public-core-observation.mjs`/`ruleset-source.mjs` primitives
  (not a revival of Phoenix's separate pre-merge API surface). Given WP5's
  Critic review just caught 3 MAJOR defects in a gate-adjacent design before
  implementation, this change (which touches the bootstrap readiness gate's
  `status` semantics) gets the same design-first → Critic-review →
  implement sequence before any code is written.
- **Rationale:** PO decision. Design-first is not optional overhead here —
  it just proved its worth on a closely related security-gate change in the
  same session.
- **Assignment (if accepted):** design phase, next dispatch.
- **Date:** 2026-08-07

**Design phase (2026-08-07):** produced — commit `a75a45d`,
`specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`
Part A. Reuses `observeCodexPublicCoreIdentity`/`observePublicCoreIdentity` +
`normalizeRulesetSource` self-referentially against a fresh 2-URL allowlist
constant; folds a negative result into the existing soft
`"plugin-refresh-required"` branch. Flags one open question for the PO (§A.4:
`normalizeRulesetSource`'s comparison is tautological when both sides are the
same self-referential observation — is that acceptable, or is a genuinely
independent second identity source wanted?) and one rollout question (§A.6:
soft-advisory vs. hard-block on day one). A first (not delta) Critic review is
dispatched next, before implementation.

**Critic review (2026-08-07): FAIL.** Full findings:
`specs/sprint-phoenix-epic/evidence/wp2wp3-design-critic-review-a75a45d.md`.
Part-A-specific findings: (F1, BLOCKER) the "soft/advisory" framing in §A.6
is wrong — the chosen `"plugin-refresh-required"` status branch sets
`nextAction: null`, and the mandatory bootstrap skill requires executing
`nextAction` and forbids printing its confirmation line on non-ready state,
so this is not a soft failure in practice; (F4, MAJOR) §A.1's stated
guarantee ("byte-identical to a clean checkout") overstates what the
mechanism delivers — it performs no remote read, only checks for
*uncommitted* local drift, so a clone with arbitrary *committed* changes
passes; (F5, MAJOR) the new 2-URL allowlist constant is left as an
unprotected gate-strength surface — `guard-gate-strength.mjs`'s
`GATE_STRENGTH_PATHS` doesn't cover it, and §A.7 explicitly scopes out the
fix that would. A rework dispatch addressing these plus the companion
item's Part-B findings is next, then a bounded re-review before
implementation.

**Rework (2026-08-07): landed, commit `8c526dd`.** F1 corrects the false
"soft/advisory" claim and widens Part A's scope to a companion
`nextAction`/`SKILL.md`/`onboarding-recovery.md` fix (named, not
implemented) so the branch genuinely has something safe to do; F4 rewrites
Part A's guarantee to what a local-only check can actually prove
(allowlisted origin + no uncommitted drift, not byte-identity); F5 adds
`GATE_STRENGTH_PATHS` protection for the new allowlist constant, in Part
A's own scope. A bounded delta Critic re-review is dispatched next.

**Delta re-review 1 (2026-08-07): FAIL — 4 new MINOR, Part-A-relevant.**
Full findings:
`specs/sprint-phoenix-epic/evidence/wp2wp3-design-critic-delta-review-1-8c526dd.md`.
(B) §A.6's PO-facing scope figure ("four files instead of one") is wrong —
the real count is 5, across 2 separate scope additions; (C) F5's new
`GATE_STRENGTH_PATHS` entry would be the first in the repo protecting
product source rather than config, reversing GS-6's own documented choice,
and blocks in-session creation/maintenance of the module it protects,
undisclosed. F1/F4/F5 remain genuinely resolved. A scoped rework is
dispatched next.
