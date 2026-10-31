# VCR01 repin of six outgrown sites counts (candidate 13, Elephant-built)

Built by the Elephant under the PO's small-items exception, in a throwaway clone of HEAD c00c06e7f with the thirteen
candidate-13 patches and the inventory rebaseline applied by the rehearsed apply script. The patch changes one file,
`harness/scripts/check-verify-case-completion.test.mjs`, and applies after G15c2 (and after the rebaseline, which does not
touch it).

## Change

Six `newlyCounted` sites counts in VCR01 had been outgrown by their suites. They were measured on the candidate with the
unchanged classifier (`classifyVulnerableSuite`):

- agy-item-delivery-tests: 33 -> 36
- critic-course-admission-tests: 259 -> 329
- critic-dispatch-preflight-tests: 246 -> 314 (296 on plain HEAD; N33b adds 18)
- critic-generic-batch-tests: 79 -> 115
- guard-dispatch-budget-checkpoint-tests: 143 -> 154
- slice-queue-cli-tests: 125 -> 132

Five of these six already drifted on plain HEAD; the sixth (critic-dispatch-preflight) moves further with N33b. These are
the only numbers that change. Names, paths, classifications, the R8 identity digest and the pinned counts stay as they were,
and an own restatement comment records the change (QG-04).

## Evidence

- Before the repin, VCR01 fails on the candidate with exactly these six diffs, and no other row differs. The measurement
  script `scratch/agent-out/vcr01-measure.mjs` read all 100 rows.
- After the repin, `check-verify-case-completion.test.mjs` passes on the candidate: 32 pass, 0 fail.
- `git apply --check` exit 0 on the candidate.

## Downstream

The change is test-only. Only VCR01 reads `newlyCounted`; no production file or other suite references these numbers.
