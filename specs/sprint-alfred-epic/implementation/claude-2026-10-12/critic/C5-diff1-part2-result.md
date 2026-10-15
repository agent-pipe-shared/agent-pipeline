# Critic C5 diff round 1, part 2: result (persisted by the Elephant)

The Critic could not persist its notes (`DISPATCH-BUDGET-CRITIC-NOTES-UNAVAILABLE: critic-notes-partial-held`);
the Elephant records the returned report. Route: requested `claude-sonnet-5-5 at high`; observed
`claude-sonnet-5-5`. Lane: functional-equivalent-read-only. Review object: `012333a88`, `7fb29f0ab`
([briefing](C5-diff1-part2.md)). Base cap 35; 34 calls used.

**Status: PARTIAL review, pass/fail withheld. No finding passed the evidence gate.**

## Candidate (not a finding), confirmed by the Elephant

The Critic flagged `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs:1722-1723` without reading the
block. The Elephant read it: under the comment "SEC-11: recursive rg keeps default hidden/ignore semantics; globs
may expose private paths", the existing examiner asserts that
`rg -l -S lifecycle plugins -g '*.mjs' -g '*.md' | head -n 180` is NOT a bounded read-only pipeline and NOT a
read-only diagnostic. ALF-C-P1-10.patch and ALF-C-P1-10B.patch remove the `globProvided` refusal and add
`-g`/`--glob` to `REPEATABLE_SEARCH_VALUE`, so applying either patch contradicts this SEC-11 examiner
(`guardrails/security.md` SEC-11: recursive content search stays scoped and checks its traversed inventory).
Disposition: correction ALF-C-P1-10D keeps repeated `-g` refused; whether to admit it is a PO decision
(PO topic list, item 23).

## Examined and found in order (summary)

- Category 1: AC-128/K3 declarations match the code line by line (object spelling, path rule, head-only sink 1..500,
  stat first-argument rule, two fixed formats, containment/alias/passive policy); AP10-AP14 assert the real guard
  verdict and the lane predicate. AC-164: OWN-1..4 unchanged; OWN-7 covers the production claim reader (owner from
  both worktrees admitted, others refused, attacker-writable claim refused for all).
- 24C shape: one condition term replaced; POSIX branch verbatim; win32 requires `secure`; `unavailable`/`insecure`
  fail closed (`DRO-RECORD`, caught at lane:108-110); `evaluateWindowsPrivateState` checks owner, reparse point and
  foreign ACEs.
- Category 2: each patch touches exactly its briefed paths; `git apply --check` of both exits 0 (Critic's own run);
  only the `node:fs` import line is removed in each pin.
- Category 3 (24C): other `physicalCreationFile` call sites stay POSIX-only and fail closed on win32.
- Categories 5, 6, 8, 10: no test weakened; DACL change between assess and open caught by `sameFile`; PowerShell via
  env var and `-LiteralPath`, fixed executable, `shell:false`; no new external dependency.
- Category 7 (partial): trailers, no secret or machine path, English, no protected test path touched.
- Dropped (no anchor): stale comment in the OWN pin (lines 28-29); one PowerShell DACL child per claimed-record
  write (bounded, fail-closed); `Dispatch: ALF-C-P1-10C` trailer on the 10B artifact commit.

## Trajectory: not verifiable

`git apply --check` and the test/pin counts reproduce; RED/GREEN mirror runs and dispatch records are not retained.

## Not reached

`guardrails/security.md` SEC-11 body (read by the Elephant afterwards, lines 191-207); `guardrails/quality-gates.md`
bodies; `roles/goldfish.md`; `project/pipeline.json`; category 3 remainder for 012333a88 (other claim readers,
production hardening of `.git/agent-pipeline`); `dispatch-record-ownership-binds-an-attempted-creation.test.mjs`
lines 125-end; `dispatch-record-lane.mjs` lines 305-end.

## Round status

This closes the one C5 correction-diff round (PO decision K12). No further Critic round follows; the P1-10D
correction is verified by the Elephant (PO rule: one FULL plus at most one DIFF, then self-verify).
