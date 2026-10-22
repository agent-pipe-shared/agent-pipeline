---
schema: pipeline.backlog-item.v1
id: pipeline.session-readiness-drops-to-partial-after-bootstrap-ready
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Manual observation, Claude Code session on Windows, 2026-10-03, feat/sprint-alfred at a0d83ce78."
sprint: alfred
done_when: manual
---

# Session readiness is `partial` after a fully ready bootstrap sequence

## Description

The bootstrap sequence ran as `pipeline-start` prescribes. The preflight
returned `ready`. Its `nextAction`, `project-onboarding-v3.mjs inspect --intent
bootstrap --runner claude`, returned `ready`, and `pipeline-state.mjs inspect`
returned `draft` as expected. Shortly afterwards a read-only `git grep` was
refused with `GUARD-LIFECYCLE-NOT-READY: Pipeline session readiness is partial`.
The guard demanded a further `inspect --intent session` that neither the
preflight nor `SKILL.md` names. That inspect then returned `ready` with
`sessionCapability: passed`. Of two parallel `git grep` calls in the same turn,
one was refused and one admitted.

The prescribed sequence therefore does not by itself produce the readiness the
guard checks, and the switch between the two states looks timing-dependent.
A possible contributor is the failed observation-governance bootstrap
(`OGB-CHECK-FAILED`) in between. Not measured.

## Triggering situation

Bootstrap re-entry 2026-10-03 per `docs/0.7-recovery-2026-10-03.md`.

## Affected artifact

`plugins/pipeline-core/skills/pipeline-start/SKILL.md` (command sequence),
`scripts/pipeline-start-preflight.mjs` (`nextAction` intent), and the
readiness evaluation in `hooks/guard-lifecycle-ready.mjs`.

## Proposal

Make the documented bootstrap sequence end in the exact readiness state the
guard evaluates: either the preflight emits `--intent session` for an
interactive session, or the guard accepts a ready `bootstrap` readback. Record
the transition that sets `partial` with a typed reason, and test that parallel
read-only calls see one consistent readiness snapshot.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** D112 (PO tiles, 2026-10-22): the residual flap is fixed in 0.7.0; the cleanup inspector treats a descriptor deleted between listing and reading as already removed.
- **Rationale:** the residual (a listed-then-retired descriptor only absorbed by the three-attempt re-observation) was a measured source of `partial` under concurrent agents, so the inspector now skips it like the listing does.
- **Assignment (if accepted):** done as commits `1307d47d4` (fix) and `458d8d450` (pins AC7b to AC7e); acceptance of the item as a whole stays with the PO.
- **Date:** 2026-10-23

## Observed again 2026-10-05

Flapping readiness `partial` was seen again in the Alfred session. It is not
caused by GUARD-READ-TARGET (the Explore lookup). Hypothesis: concurrent
preflights rewrite authority state. Not measured. Instrument first, then fix.

## Observed again 2026-10-05 (measured)

2 of 60 sequential `project-onboarding-v3.mjs inspect --intent session` runs
returned `partial` under 4-5 concurrent agents. Both carried
`$.authority.sessionCleanup` / `cleanup_recovery_observation_unavailable`. The
code path is the bare strict-mode `catch` in `lib/project-onboarding-v3.mjs`
(about lines 1869-1886), which turns any observation failure into that code.
A fix dispatch (FLAP) is in progress.

## Covered and measured 2026-10-22

The two FLAP fixes (`073a5a230` bounded re-observation, `d3c41ca5e` skip of a descriptor retired between listing and
loading) are now pinned over real shared on-disk state: `lib/pins/session-readiness-drops-to-partial-after-bootstrap-ready.test.mjs`
AC7a/AC7b run a separate OS process that owns a real session descriptor and retires it at an exact point of the parent's
strict cleanup-recovery observation. Both cases fail (`cleanup_recovery_observation_unavailable`, cause
`WT-SESSION-MISSING`) with either fix reverted and pass with both in place.

Residual, measured and not asserted: a dense create/retire loop of sub-millisecond descriptors (3-4 processes) still
makes a share of the strict observations `partial` (26 of 46 raw plans before the fixes, 2 of 28-31 observations with the
retry in place, about 25 percent of raw plan calls throwing `WT-SESSION-MISSING` from the retirement inspector's
required load). A listed descriptor retired before `inspectSessionRetirement` loads it is only absorbed by the three-attempt
re-observation, not skipped. Real sessions hold a descriptor for far longer than a plan takes, so this is a stress bound,
not the measured 2-of-60 schedule; whether the inspector should skip a listed-then-retired descriptor like the listing
does is a design question for the owner of `session-cleanup-recovery.mjs`.

## Reconciled 2026-10-23

Text sweep K60-BACKLOG-TEXT-SWEEP-4. The section "Covered and measured 2026-10-22" above stays as history; its Residual
paragraph is superseded:

- "A listed descriptor retired before `inspectSessionRetirement` loads it is only absorbed by the three-attempt
  re-observation, not skipped ... whether the inspector should skip a listed-then-retired descriptor like the listing
  does is a design question": decided and built later the same day. PO decision D112 (2026-10-22,
  `specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md`). Commit `1307d47d4` made `inspectListedDescriptors()` in
  `lib/session-cleanup-recovery.mjs` drop a descriptor whose load answers `WT-SESSION-MISSING`; any other failure
  (malformed, binding, digest mismatch) still throws, so a present descriptor keeps its fail-closed verdict. Commit
  `458d8d450` pinned it in `lib/pins/session-readiness-drops-to-partial-after-bootstrap-ready.test.mjs`: AC7c (retirement
  inspector) and AC7d (external-archive inspector) retire the descriptor inside the injected inspector seam, AC7e is the
  control that a malformed descriptor still fails closed, and AC7b now needs one plan call instead of two (QG-04 note in
  that commit). The bounded re-observation itself is untouched.
- The residual figures ("26 of 46 raw plans", "about 25 percent of raw plan calls", "2 of 28-31 observations") describe
  the state before D112 and are not the current behaviour of the dense create/retire loop.
- The Description's complaint that the guard demands an `inspect --intent session` that the preflight does not name:
  the pin cases AC1 to AC4 of the same file assert that a bootstrap-ready but session-partial state makes the preflight
  emit the read-only `inspect --intent session` action, and commit `0963e8087` (2026-10-16) gave a partial readiness a
  typed reason; AC6 covers real parallel preflight processes. The `SKILL.md` prose is named in the pin header as not covered.
- The empty Triage block: filled above from D112 (it settles the residual flap; the item stays `open` for PO acceptance).
