# Held patch: critic-bound-verify remedy names the concrete Critic route (Slice R)

Dispatch W7-PUSHPREP-ROUTE-REMEDY-C1-20261027, candidate fa6cb7f99ea071b789c38d16aaef0c74e996ef04. Item: pipeline.consumer-push-blocked-by-late-review-unit (recon: scratch/wave3/recon-late-review-unit-push-block.md; the package binds AC-127 of the parent brownfield item only because the generator needs a criterion).

## Cause
`push-prepare.mjs` (critic-bound-verify check, line 751) gave every failing candidate qualification the same generic remedy, including code `private-critic-binding-unavailable`, naming no concrete route. Recon claim re-verified at the candidate: lines 748-752 are as cited.

## Exact change (patch: w7-pushprep-route-remedy.patch, 2 files, +39/-1)
- `plugins/pipeline-core/scripts/push-prepare.mjs`: the remedy is a ternary on `review.code`. For `private-critic-binding-unavailable` it is the single line `run node ${PIPELINE_PLUGIN_ROOT}/scripts/critic-dispatch-preflight.mjs --base <merge base of HEAD with the publication target> --candidate HEAD (a late-added review unit may use that merge base as its first base), then Verify that exact candidate`. Every other code keeps the previous generic text unchanged. `ok:true` still carries no remedy.
- `plugins/pipeline-core/scripts/push-prepare.test.mjs`: 4 new cases after "retained rigor after close still requires candidate review"; no existing case touched.
- mainRef logic untouched (slice w7-mainref-ancestor).

## RED / GREEN
- RED (unchanged push-prepare.mjs + new cases, clone): exit 1, 1 failing, "critic-bound-verify remedy for private-critic-binding-unavailable names the concrete Critic route" (actual was the generic text). The other three new cases are guards on behaviour that must stay unchanged (other code keeps generic remedy; ok:true has no remedy; checkpoint profile has no check) and passed already, as expected.
- GREEN (patched, clone): exit 0, tests 88, pass 88, fail 0.
- Baseline (clone2, unchanged candidate): exit 0, tests 84, pass 84, fail 0.
- Failing-name sets: baseline empty, patched empty. Difference is exactly +4 tests, all new. No pre-existing failure.
- Logs: scratch/agent-out/w7b/{red,green,base}.push-prepare.test.mjs.log (scratch, untracked).
- Apply check: `git apply --check` of the patch in clone2 at the candidate: exit 0.

## Not done
- No Slice M (mainRef relaxation), no repair-map route, no CCA-RANGE-BOUND change.
- The remedy line is long (about 230 chars); it is a report-check remedy, not a rendered 72-char command block. If the renderer wraps remedies, shorten at review.
- Only push-prepare.test.mjs ran; no Full Verify.
- Independent Critic review stays a parent-owned batch gate; PO acceptance pending.

## Proposed commit message
fix(push): the critic-bound-verify remedy names the concrete Critic route for a late review unit (Slice R)

## Operator flow
1. Apply the diff at the candidate: `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pushprep-route-remedy.patch`
2. `git add -u -- plugins/pipeline-core/scripts/push-prepare.mjs plugins/pipeline-core/scripts/push-prepare.test.mjs`
3. Commit with `--no-verify` (operator, per D165 held-patch practice) using the message above plus trailers.
4. Stamp, then install, as for the earlier held patches.

## Protected-path classification observed
`push-prepare.mjs` is in NEVER_LIFTABLE_KERNEL_PATHS per the recon (lib/guard-maintenance-window.mjs:384; not re-read by me). `push-prepare.test.mjs` matches none of TP-1..TP-13 in agent-obligations section 2. I did not edit either in the repository; all edits were in the scratch clone, hence the held patch.
