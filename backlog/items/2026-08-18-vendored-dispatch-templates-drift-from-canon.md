---
schema: pipeline.backlog-item.v1
id: pipeline.vendored-dispatch-templates-drift-from-canon
type: defect
owner: pipeline
status: closed
created: 2026-08-18
source: "Incremental handover-rotation extraction pass (ADR-0066 Decision 6/7), 2026-08-18, second rotation batch, preamble narrative (2026-08-11 'NOVA-CLOSING-ALLOWANCE-01' entry). Finding surfaced by a read-only research fork, verified against current source before filing."
---

# `plugins/pipeline-core/templates/prompts/{goldfish-task,critic-review}.md` have drifted from the canonical `templates/prompts/` copies

## Description

The canonical dispatch templates at `templates/prompts/goldfish-task.md` and
`templates/prompts/critic-review.md` are what CLAUDE.md's "Dispatch from the
template, never freehand" rule requires every dispatch to be built from. The
plugin also vendors its own copies at
`plugins/pipeline-core/templates/prompts/{goldfish-task,critic-review}.md`
for installed-plugin use. No suite enforces byte-equality between the two,
and they have drifted: verified by direct diff today,
`plugins/pipeline-core/templates/prompts/goldfish-task.md` is missing
several sections present in the canonical copy — the worktree self-heal
check, the `check-consumer-safe-paths` DoD step, the `agentType`/
model-derivation field, and the explicit-override (`modelOverride`) field.

This is a live correctness gap, not just documentation drift: a dispatch
built from the vendored (installed-plugin) copy silently lacks safety/
discipline content the canonical copy already has.

## Triggering situation

Incremental extraction pass over `docs/state.md`'s second rotation batch
(2026-08-11 through 2026-08-18 dated sections) before that content is
archived (ADR-0066 Decision 6/7). The gap was originally noted in-session on
2026-08-11 as "needs a future re-sync dispatch" but never filed as its own
backlog item; checked for one now (`GF-107`, "vendor", "goldfish-task.md
diverge") — none exists. The nearest related item,
`2026-08-10-plugin-package-should-vendor-canon-references-via-build-step.md`,
covers a different concern (a build step for canon *references*, not these
two dispatch templates).

## Affected artifact

`plugins/pipeline-core/templates/prompts/goldfish-task.md` and
`plugins/pipeline-core/templates/prompts/critic-review.md` (need re-sync to
their canonical counterparts), plus ideally a suite that pins byte-equality
(or an intentional-diff allowlist) going forward so this cannot silently
drift again.

## Proposal

Not yet designed in detail. Likely direction: a re-sync dispatch that
diffs and updates the vendored copies, plus a small guard/test asserting the
two copies match (or fail loud on an unreviewed divergence) so this class of
drift is caught mechanically rather than rediscovered by extraction passes.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding.
- **Rationale:** real, live gap (installed-plugin dispatches missing
  safety content), but re-syncing + adding drift protection is its own
  bounded task, not something to do inline while mid an unrelated rotation
  pass.
- **Date:** 2026-08-18

## Closure, 2026-08-19 (Wave 5 round 1, dispatch NVA-W5-02, retried)

Both vendored copies re-synced byte-for-byte with their canonical
counterparts (`diff` produces no output for either pair). A new
standalone guard, `plugins/pipeline-core/scripts/check-vendored-template-sync.mjs`
(+ its `.test.mjs`, 4/4 pass), pins byte-equality going forward and
fails loud on divergence — not wired into `harness/scripts/verify.mjs`
(TP-protected, needs a separate signed ceremony; noted as a follow-up).
A first dispatch attempt at this exact task produced no commit and an
empty result; the retry succeeded (commit `de477b2a`, cherry-picked
onto trunk as `4c97d9d8`). One post-landing fix was needed and applied
directly (commit `e8ded04c`): the new guard's own doc comment named
`harness/scripts/verify.mjs`, a Pipeline-source-only path that doesn't
exist in a consumer project — caught by `check-consumer-safe-paths.test.mjs`
only after combining this change with the rest of Wave 5 round 1 on
trunk (the dispatch's own isolated-worktree run of that same suite had
reported 9/9 pass, before this line existed in that exact form — a
timing/ordering artifact, not a suite defect). Reworded to describe the
file by role rather than by path; suite now 9/9 clean.
