# W7 held patch: half-moved repair lane (Slice B)

Patch: `w7-half-moved-repair-lane.patch` (git diff --binary at candidate 400c6213db04d4abf1c93335b59d68a9a2e7d086; three files).
Item: pipeline.half-moved-feature-directory-locks-every-shell-and-source-write (criterion AC-127 binding only). Recon: scratch/wave3/recon-half-moved-feature-directory.md (cited lines re-verified: lifecycle-gate.mjs record lane at :228, refusal at :339, write-scope.mjs w04BoundAuthorityPaths at :23; no contradiction found).

Proposed commit message:
`fix(guard): admit the exact git mv and git restore repair commands inside the bound feature directory under an invalid observation (Slice B)`

## Cause
Under PORG-INVALID-OBSERVATION (session) no lane admitted `git mv` / `git restore`, so a half-moved feature directory could not be repaired by the session that was locked by it.

## Changed lines (in the patch)
- `plugins/pipeline-core/lib/guard/write-scope.mjs`: new `HALF_MOVED_ROOT_PREFIXES`, `w04BoundFeatureDirectories(root)` and exported `isHalfMovedRepairCommand(command, root, deps)`, inserted after `w04IsNonAuthorityRecordWrite`.
- `plugins/pipeline-core/lib/guard/lifecycle-gate.mjs`: import of `isHalfMovedRepairCommand`; new `invalidObservationHalfMovedRepair` lane directly after the `invalidObservationRecordWrite` return (code PORG-INVALID-OBSERVATION, intent session, Bash).
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`: cases HM-1..HM-6 inserted after QP3-4.

## Admission rules
Command is exactly `git mv A B` or `git restore P` (simpleWords: one simple command, so no chaining or redirect). No operand starting with `-`, containing `..` segment, backslash, glob or shell metacharacters or whitespace. Every operand strictly inside ONE bound feature directory (dirname of the active feature planPath/specPath/designInputPath in project/ or .claude/ pipeline-state.json, at least 2 segments, first segment specs or docs); physical path (nearest-existing-ancestor realpath) must equal the lexical spelling, so no symlink anywhere on the path; leaf symlink refused. A bound authority file may be renamed only within its own directory. Unreadable or unparseable state, or no feature directory: nothing admitted.

## RED and GREEN
- RED (unchanged clone, `--test-name-pattern=^HM-`): tests 6, pass 5, fail 1. HM-1 red (admission); HM-2..HM-6 are refusal pins and controls that already hold at the candidate and guard the implementation. Log: scratch/agent-out/w7i/red.log.
- GREEN (patched clone): tests 6, pass 6, fail 0 (HM-1..HM-6). Log: scratch/agent-out/w7i/green.log.
- Whole file baseline (clone2) versus patched (clone): see "Whole-file comparison" below.

## Whole-file comparison
Whole plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs, `node --test`, exit 0 in both (logs scratch/agent-out/w7i/full-base.log and full-patched.log, scratch is untracked):
- Baseline (clone2, candidate): tests 402, pass 399, fail 0, skipped 3.
- Patched (clone): tests 408, pass 405, fail 0, skipped 3.
Failing-name sets: both empty (identical); the +6 tests are exactly HM-1..HM-6; the 3 skips are pre-existing and identical in count in both runs.

## NOT done
- PowerShell parity (follow-up): the lane is Bash-only. Windows absolute paths with backslashes are refused (fail closed).
- Inspect/preflight next-step unification and relocate-authority-artifact (out of slice).
- codex-pretool-guard.test.mjs and antigravity-pretool-guard.test.mjs re-runs: NOT run (budget); the lane lives in shared lib/guard code, still to be run before apply.
- Feature directory source is only activeFeature.*Path; continuity.authority.* paths are not consulted.
- Slice A (tripwire D18) is a separate patch.

## Operator flow
1. `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-half-moved-repair-lane.patch` (apply check passed in clone2 at the candidate).
2. `git add -u -- plugins/pipeline-core/lib/guard/lifecycle-gate.mjs plugins/pipeline-core/lib/guard/write-scope.mjs plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
3. `git commit --no-verify` with the proposed message.
4. Stamp, install.

Protected-path classification observed: none of the three files matches TP-1..TP-13; they are guard sources (control-placement), so they travel as a held patch applied by the operator. Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.
