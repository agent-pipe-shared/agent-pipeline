# PF-95 K1: replaying a takeover audited before the origins fix moves the leftover origins entry

State: HELD PATCH, stacked on f1, f1-c2, f2, f3, f4, c24, h1, h2 (apply after them). The patch next to this file is the incremental diff of the scratch clone against that stacked baseline, candidate 5cf6f2baad41187e10e34872e73f9365b4178e3e. Nothing applied, installed, independently reviewed or accepted. The Goldfish delivered a checkpoint; the Elephant verified and corrected this note.

## Cause
`supersedeFeatureCourseTakeover` (critic-generic-batch.mjs, move loop) finished on replay only the moves named by the old audit. A takeover audited before the origins fix does not name the delivery-target origins entry, so it stayed live and owned by the old batch and the next `admit` ended in CGB-CONFLICT. A fresh supersede cannot help (logical entries are already moved, `inspect` reports CGB-TAKEOVER-NONE).

## Changes
- `plugins/pipeline-core/lib/critic-generic-batch.mjs`: on replay the loop runs over `[...audit.moves, ...leftover]`, where `leftover` is every entry of `originEntriesOf(c, audit.batchRef)` as `{kind: "origins", file}`. The existing `existsSync(from)` guard keeps repeats and already-audited entries a no-op. Audit record, digest semantics and the non-replay branch are untouched.
- `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`: `renameSync` import and the case `PF95 REPLAY (a) ...`. It reaches the real state (featureCourseFixture, finalize, inspect, supersede), simulates the legacy audit (canonical JSON without the delivery entry, delivery entry moved back to live `origins/`), replays the same request and asserts: status superseded, replay true, no live origins entry, entry under the digest directory with identical bytes, audit unchanged, second replay idempotent, same task admitted again.

Deviation from the briefing: the case lives in the finalizer test file (the admit step is a finalizer fixture), not in critic-generic-batch.test.mjs. That file has no pin change; check-verify-case-completion stays 32 of 32.

## Evidence (Elephant, fresh clone at HEAD 5cf6f2baa plus the nine patches in order)
- Chain apply: all nine patches apply cleanly in order.
- RED: the new case with the production hunk reverted fails at `the leftover delivery entry is no longer live`.
- GREEN: the same case passes with the fix restored.
- Suites patched: finalizer 89 tests, 88 pass, 1 fail (the known baseline red `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`, test line 237, an `assurance: null` mismatch, not touched by this slice); critic-generic-batch 35/35; critic-course-admission 68/68; check-verify-case-completion 32/32; `generate-architecture-overview.mjs --check` current.

## NOT done
- No native Windows run, no real consumer retest, no independent Critic review (parent-owned batch gate), no Full Verify.
- Operator documentation: `plugins/pipeline-core/skills/critic-review/SKILL.md`, takeover step 1, could add: "If a takeover audited before the origins fix still ends in CGB-CONFLICT at the delivery target, rerun the same supersede-course-takeover request: the replay now moves every origins entry still owned by the old batch." Not edited (outside the slice file list).

## Proposed commit message
fix(critic): complete a takeover audited before the origins fix when its supersede request is replayed (PF-95)

## Operator flow
Apply the diff after the eight prerequisites; `git add -u -- plugins harness`; commit with `--no-verify`; Elephant stamps; PO refreshes the plugin copy. No protected path touched.
