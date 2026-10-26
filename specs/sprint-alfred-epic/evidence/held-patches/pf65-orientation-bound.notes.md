# Held patch: PF-65 orientation bound and coordinator facts

Patch: `pf65-orientation-bound.patch` (git diff, 3 files). Criterion: AC-142; consumer report 05 finding PF-65.
`plugins/pipeline-core/lib/dispatch-briefing-build.mjs` is a NEVER_LIFTABLE kernel path, so this ships as a held patch for the PO's bundled signed ceremony.

## Order and base

Apply `r2-route-effort.patch` first, then `pf65-orientation-bound.patch` (the patch diffs against a base that already carries r2, which touches the help text and appends tests in `dispatch-briefing.test.mjs`). Both applied cleanly with `git apply` to a fresh clone of repository HEAD 5e615da5c.

Preimage SHA-256 at the base (HEAD + r2):

- `plugins/pipeline-core/lib/dispatch-briefing-build.mjs` 56ed13c03e102b458bb79739cba024f894a6bdb0c743cc95190ac54c9a9db066 (r2 does not touch it)
- `plugins/pipeline-core/scripts/dispatch-briefing.mjs` 2baf9de8adc78b55a770b9b754fb386810433df07b5dec76001f788f991f6aca
- `plugins/pipeline-core/scripts/dispatch-briefing.test.mjs` 1cf9456aa0761786ad942c847c16491d6e1c9b3bcb2e6aa1193f59c996530abc

(At bare HEAD, before r2, the last two are bb859021... and d2abece3...)

## Behaviour

- New optional package field `facts` (non-empty array of non-empty strings); rendered in section 1 after the goal under `Facts established by the coordinator (do not re-derive):`; absent facts leave the text byte-identical.
- Exported `ORIENTATION_PATH_BOUND = 6` and `packageAdvisories(pkg)`: `DBG-PACKAGE-ORIENTATION-HEAVY` (more than 6 distinct paths, no facts) then `DBG-PACKAGE-ESTIMATE-LOW` (estimate absent or below 8 + 3 x distinct paths; heuristic, uncalibrated). Warnings only; `ok` stays true. `buildDispatchBriefing` appends them; help text lists `facts`.

## Test counts (in the clone)

- PF-65 tests RED before implementation: whole file 85 pass / 5 fail (4 new PF-65 tests included).
- GREEN after: `dispatch-briefing.test.mjs` 89 pass / 1 fail (90 tests). The one failure is test 3 "public --help and -h work before setup without private reads, processes or filesystem effects": pre-existing, it also fails at the repository HEAD (Node 24 module resolution calls realpathSync inside the help audit, `HELP-AUDIT:["realpathSync"]`). Not fixed here.
- `check-consumer-safe-paths.test.mjs`: 9 pass / 0 fail.
- `claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs`: 7 pass / 0 fail at bare HEAD; 0 pass / 7 fail at HEAD + r2 (with or without this patch; 9 pass / 7 fail in the two-file run, which includes the consumer-safe-paths cases). First line of the failure: `DBG-EFFORT-ROUTE-CONTRADICTION ... agent definition goldfish-deep pins effort xhigh but the configured Claude route duty.deep selects effort medium`. This regression is caused by the r2-route-effort patch (the new refusal), not by this patch; it needs attention in the r2 bundle (the pin's fixture or the goldfish-deep definition).
- Stack check in a second fresh clone of HEAD: r2 then pf65 both apply; `dispatch-briefing.test.mjs` 89 pass / 1 fail (test 3 only).

## Justified change to a PF-65 test after implementation (AC-142)

Test "PF-65 a facts list ... is accepted; a wrongly typed facts value is refused" first included `[]` among the bad values. Removed: optional package lists admit an empty array by contract (packages routinely carry `"newFiles": []`), so refusing `[]` for `facts` alone would contradict the closed schema AC-142 builds on. All other bad values (a string, `[""]`, `[3]`) remain.

## Overlap with other held patches

Overlaps r2-route-effort.patch in `dispatch-briefing.mjs` (help text lines near 60-69) and in the end of `dispatch-briefing.test.mjs`; stacking after r2 is the verified order. Overlap with other held patches in this folder was not checked beyond r2.

## Proposed commit message

feat(dispatch-briefing): carry coordinator facts and warn on an orientation-heavy package (PF-65)
