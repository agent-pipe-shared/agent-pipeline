---
schema: pipeline.backlog-item.v1
id: pipeline.attestation-git-presence-gate-not-gs8-protected
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: Critic finding F-B, delta re-review of the F2 implementation fix (specs/sprint-phoenix-epic/evidence/wp2wp3-parta-rework-1-delta-critic-review-7aa84f0.md); recorded via the WP2-WP3-partA-rework-2 dispatch (which also fixed F-A/F-C/F-D from the same review).
---

# The attestation's own `.git`-presence gate is not GS-8-class protected

## Description

GS-8 (`plugins/pipeline-core/hooks/guard-gate-strength.mjs`) was added
specifically so the bootstrap self-application attestation's gate-deciding
allowlist constant (`PUBLIC_SELF_APPLICATION_ORIGINS`,
`plugins/pipeline-core/lib/public-core-origin-allowlist.mjs`) cannot be
silently widened without going through the reviewed guard-strength surface
(design `specs/sprint-phoenix-epic/design/bootstrap-origin-allowlist-and-codex-wsl-freshness.md`
§A.3 item 3).

The F2 fix (Critic finding F2, `WP2-WP3-partA-rework-1`) moved an equally
gate-deciding decision one level up, into `pipeline-start-preflight.mjs`'s
`pluginRootHasSelfApplicationGit(pluginRoot)` check
(`if (version && pluginRootHasSelfApplicationGit(pluginRoot)) { ... }`,
around line 257): whether the origin/content attestation is attempted **at
all**. That line is not in `GATE_STRENGTH_PATHS` and has no GS-N entry of its
own — an agent (or a future edit) could silently weaken or remove the `.git`
presence gate itself, or the surrounding `if`, without tripping any
gate-strength check, and the change would take effect on the next plugin
refresh exactly the way a GS-8 constant edit would. The exact hole GS-8 was
introduced to close (an unprotected gate-deciding surface for this
attestation) is reopened one level up, in the code that decides whether the
protected constant is ever consulted.

Kept minor by the originating Critic review: `pipeline-start-preflight.mjs`
stays under the ordinary Verify/Critic/PO review gate regardless (it is not
an unreviewed surface), so this is a residual hardening gap, not an active
bypass.

## Triggering situation

Critic finding F-B, delta re-review of commit `7aa84f0`
(`specs/sprint-phoenix-epic/evidence/wp2wp3-parta-rework-1-delta-critic-review-7aa84f0.md`),
against the F2 fix landed by `WP2-WP3-partA-rework-1`. Recorded as a backlog
item (not code-fixed) by dispatch `WP2-WP3-partA-rework-2`, per that
dispatch's explicit scope boundary: F-B is disclosure/tracking only in that
dispatch, no guard change.

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` (the
`pluginRootHasSelfApplicationGit` gate and its call site), and
`plugins/pipeline-core/hooks/guard-gate-strength.mjs` (`GATE_STRENGTH_PATHS`,
if a GS-N extension is the chosen resolution).

## Proposal

**Owner: PO.** This needs its own scoping decision before any guard change is
implemented — explicitly not decided or implemented by this item. Candidate
directions, disclosed here rather than pre-selected:

1. A new, narrow GS-9 entry protecting the specific gate-deciding line/function
   in `pipeline-start-preflight.mjs` (would be GS-8's second product-source
   exception, after GS-8 itself was already a deliberate, narrow departure
   from `GATE_STRENGTH_PATHS`'s config-only convention — see GS-8's own
   comment in `guard-gate-strength.mjs`). A whole-file entry would almost
   certainly be too broad (the file carries much more than this one gate) and
   would need its own constant-extraction refactor first, matching the
   pattern that made GS-8 itself narrow (a small, self-contained constant
   module, not a slice of a larger script).
2. Accept the residual as-is: the ordinary Verify/Critic/PO review gate is
   judged sufficient protection for this specific line, and no GS-N entry is
   added.

No guard change should be implemented until the PO has made this scoping
decision — a constant-extraction (option 1) is itself a non-trivial design
step (new module, new import, behavior-preserving refactor of a script
already gating live bootstrap readiness) and deserves the same
design-first-if-in-doubt treatment (MP-22/23) this design document's Part A
already received for its own gate-strength question (§A.3 item 3).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
