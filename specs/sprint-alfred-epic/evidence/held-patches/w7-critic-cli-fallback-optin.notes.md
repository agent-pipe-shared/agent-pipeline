# Held patch: finalizer CLI --allow-caller-authored-fallback (stacked on Cut A)

Status: HELD, not applied. Stacks on `w7-critic-origin-gate.patch` (apply that first). Patch: `w7-critic-cli-fallback-optin.patch`, computed against the Cut A baseline; `git apply --check` in a fresh clone at the candidate plus Cut A: exit 0; applies in order in the full 17-patch stack.

## Cause
After Cut A, `finalizeSessionCriticReview` refuses with SCF-ORIGINAL-SOURCE-UNAVAILABLE unless `options.allowCallerAuthoredFallback === true`, and no runner issues a Source record. The closed CLI (argv length exactly 5) could not pass that option, so a real `finalize` was blocked.

## Changes (2 files)
- `session-critic-finalizer.mjs`: `optIn` = argv length 6, command `finalize`, sixth token exactly `--allow-caller-authored-fallback`. Any other argv containing that token is SCF-USAGE (checked before the export route, so export gets SCF-USAGE instead of SCF-EXPORT-USAGE). Otherwise length 5 is still required. `optIn` adds `allowCallerAuthoredFallback: true` to the finalize call. Request schema untouched, the flag is never read from the request file. Usage line for finalize extended.
- `session-critic-finalizer.test.mjs`: four cases "Cut A follow-up (1)..(4)".

## Deliberately NOT in the patch: the SKILL.md note
The Goldfish first added a runner-neutral note to `skills/critic-review/SKILL.md`. The Coordinator found that the raw SHA-256 of that file is pinned in `plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.v1.json` and checked by `codex-isolated-critic-protected-preimage.test.mjs`: with the edit that test failed (expected `60cd00b9…`, actual `9f9ceb40…`). The SKILL.md edit was therefore removed from the patch. Documenting the flag needs a follow-up that also regenerates the pinned digest (a protected-baseline change, operator step). Until then the flag is discoverable through the CLI usage line only.

## Evidence (logs under scratch/agent-out/w7l/, untracked)
- RED (clone, whole file): new (2), (3), (4) failed; (1) passed already (Cut A behaviour, a regression pin, not RED).
- Baseline (clone2, Cut A only): 35 tests, 34 pass, 1 fail: "a root-authored candidate keeps its empty-tree base but cannot register a generic batch review unit" (pre-existing; diagnosed as a stale expectation in `w7-finalizer-root-authored-baseline-failure.notes.md`).
- First patched run: new case (4) failed on a last assertion (critic-packets dir absent) that was wrong for this fixture (fixture batch registration creates the directory). That assertion was removed from the Goldfish's own new case; the SCF-USAGE assertions stay.
- Final patched whole-file run, read by the Coordinator in the clone: 39 tests, 38 pass, 1 fail (the pre-existing one). The four new cases alone: 4/4 pass. The protected-preimage pin was run only to find the SKILL.md conflict above; it is not re-run on the final 2-file patch (the file is not touched by it).

## Not done
- Documentation of the flag in SKILL.md and the pinned-digest regeneration (above).
- Independent Critic review (parent-owned batch gate), Full Verify, PO acceptance.

## Proposed commit
feat(critic): the finalizer CLI accepts --allow-caller-authored-fallback, stacked on the origin gate (Cut A follow-up)

## Operator flow
Apply the Cut A diff, then this diff; `git add -u` with a path limit to the two files; commit with --no-verify as the held-patch flow does; stamp; install.

## Protected-path classification
Neither file matched a protected pattern (TP-1..TP-13) in agent-obligations section 2; the patch was only built in a clone, so no repository write guard was exercised for plugins/ paths. The dropped SKILL.md is covered by the protected-preimage pin.
