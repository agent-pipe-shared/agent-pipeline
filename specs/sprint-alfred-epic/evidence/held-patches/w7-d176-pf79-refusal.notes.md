# Held patch W7-D176-PF79-REFUSAL: the admission refusal names the expected dispatch record and the PO-decision route (D176)

Candidate: fa6cb7f99ea071b789c38d16aaef0c74e996ef04. Patch: `w7-d176-pf79-refusal.patch` (git diff --binary against the candidate, 2 files, +43 -1).
Item: pipeline.critic-admission-requires-a-dispatch-record-a-project-cannot-have (not closed by this patch).

## Cause
`evaluateReviewAdmission` core in `plugins/pipeline-core/scripts/check-critic-skip-coverage.mjs` (line 903 at the candidate; re-verified against the recon note) refused with only `review admission requires exactly one matching target for <taskId>@<sha>; found 0`. It did not name the expected record, who writes it, or what to do when none can exist.

## Changed lines
- `check-critic-skip-coverage.mjs`: the single `findings.push` at line 903 became a block. The original prefix is unchanged, byte for byte. A suffix is appended only when `admittedCount === 0`. It names `evidence/dispatch-record-<taskId>.json`, says the host writes it at the end of a foreground goldfish dispatch (host commit), that it cannot be authored by hand, that a background dispatch leaves none, and that a range with no dispatch history has no admitted route yet and needs a PO decision (the item id above). It does not mention init-dispatch-record.mjs and promises no route (Wanted 2 stays PO-blocked).
- `check-critic-skip-coverage.test.mjs`: four new cases after the D173 case, all named "D176 ...". No existing case was changed.

## RED / GREEN
Reporter is not TAP; counts are read from the printed tail.
- RED (clone, unchanged production code, new cases only): 2 of the 4 new cases fail ("names the expected record, its producer and the PO-decision route"; "suffix appears exactly once"). The other 2 (prefix byte-identical; admitted target carries no suffix) pass against the old code by design: they are regression guards on behaviour the patch must keep. Log: `scratch/agent-out/w7a/red.check-critic-skip-coverage.test.mjs.log` (untracked).
- GREEN (clone, patched): whole file `tests 40, pass 40, fail 0`, exit 0.
- Baseline (clone2, candidate unchanged): whole file `tests 36, pass 36, fail 0`, exit 0.
- Failing-name sets: baseline empty, patched empty. No pre-existing failure. The difference is the 4 new cases.
- Apply check: `git apply --check` of the patch in clone2 at the candidate: exit 0.

## NOT done
- Wanted 2 (`undispatchedRangeEvidence`) and the PO answers Q1-Q3.
- No docs slice (producer not named in the critic-review skill or pipeline-start references).
- `critic-packet-preflight.mjs:512` needs no edit. Full Verify, native-host, verify-wsl and PO acceptance stay open.
- An independent Critic review stays a parent-owned batch gate.

## Proposed commit message
`fix(critic): the admission refusal names the expected dispatch record and the PO-decision route (D176)`

## Operator flow
1. Apply the diff at the repository root: `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-d176-pf79-refusal.patch`.
2. `git add -u -- plugins/pipeline-core/scripts/check-critic-skip-coverage.mjs plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs`.
3. Commit with `--no-verify` and a message file (AI-Assisted and Dispatch trailers).
4. Stamp, then install.

## Protected-path classification observed
Neither `check-critic-skip-coverage.mjs` nor its test file matches TP-1..TP-13 in `templates/prompts/agent-obligations.md` section 2. I did not edit them in the repository tree; the live guard classification was not tested, because all edits were in the scratch clone.
