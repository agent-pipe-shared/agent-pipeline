# Critic range bindings preflight refusal (slice C3), interim notes

State: CHECKPOINT (tool budget reached). Patch written but its last fix is NOT re-verified. Stacked on the held bundle patch (C1 bindings command and pin increment) at candidate ffeb1457b.

Update by the Elephant: the last fix was verified afterwards on a fresh clone with the four-patch chain (preflight suite 63 of 63, pin measured at 246 and carried by `w7-critic-range-bindings-preflight-c3b.patch`); see `CRITIC-RANGE-BINDINGS-BUNDLE-VERIFY-2026-10-28.md`.

## Cause
The preflight admits a range review whose range changes the handover file, a `pipeline-handover*.md` next to it, or a retained Critic result; the Critic then stops with a briefing violation after a claim is spent.

## Change (in the patch, files: critic-dispatch-preflight.mjs, its test file, critic-correction-input-bindings.mjs)
- Preflight: new optional request field and CLI flag `--correction-input-bindings` (path under scratch/). In the range path only, after base and candidate resolve and before any claim or packet work, `checkCorrectionInputBindings` derives the bindings. No exclusions and no field: unchanged, no echo. Exclusions and no field: `CDP-CORRECTION-INPUT-REQUIRED` (verb-first, names the derive command). Field present: file read and compared (digest and full canonical document); mismatch or unreadable is `CDP-CORRECTION-INPUT-STALE`; match is echoed as `correctionInputBindings: {path, digestSha256}`. Derive refusal is `CDP-CORRECTION-INPUT-REFUSED` carrying the CCI code.
- Library: additive option `projectStateOptional` (default false, still refusing). The preflight falls back to it on CCI-CALIBRATION, so repositories without a readable calibration (including this test file's older fixtures) get the classification without the project-state class. Consequence: in such a repository a state file in the range is not detected here and the Critic itself still stops on it.
- Tests: `CCI preflight (1)` to `(7)` appended to the preflight test file (7 is the library option case).

## Evidence
- RED (clone, before production edits; log scratch/agent-out/w7cu/logs/red.log): CDPF058 and CDPF059 failed among the new cases (further RED rows not read; the library edit began while that run was in flight, after module load).
- GREEN run 1 (scratch/agent-out/w7cu/logs/green.log): 63 tests, 61 pass, 2 fail. All 7 new cases (CDPF057 to CDPF063) green. Failures CDPF023 and CDPF040 (empty-tree or root base, `baseCommit` null) were regressions of my first version: derive was called with a null base.
- Fix after run 1: the check now runs only when `baseCommit !== null`. This fix is NOT re-run.

## NOT done
- GREEN rerun after the baseCommit fix (expected 63/63).
- Baseline versus patched failing-name comparison in clone2; `git apply --check` in clone2.
- VCR01 pin update (harness/scripts/check-verify-case-completion.test.mjs, row critic-dispatch-preflight-tests, 230 now; the file gains 7 cases, expected 237, to be measured). Not in the patch.
- check-product-capability-inventory, generate-architecture-overview --check, other tests importing the preflight.
- Clones left in place under scratch/agent-out/w7cu (cleanup not run).
- Help/usage text: none found in the parser. The bindings file size is bounded by the evidence read limit (1 MiB).
- Independent Critic review stays a parent-owned batch gate.

## Proposed commit message
feat(critic): refuse a Critic range with project-state or retained-result paths when the bindings file is missing or stale

## Operator flow
Apply the stacked C1 patch first, then this patch (git apply), git add -u limited to the three production/test paths, commit with --no-verify as the bundle flow does, stamp, install.

## Protected paths
None of the changed files matched a protected test path pattern of the obligations file.
