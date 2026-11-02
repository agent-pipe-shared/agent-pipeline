# w110 - restate the four sites counts of the case-completion registry

## What

`VCR01` (`harness/scripts/check-verify-case-completion.test.mjs`) pins the measured top-level assertion count of every converted suite. Four suites were outgrown by candidate 18, measured with the unchanged classifier on the applied chain: `claude-intake-prompt-capture-tests` 48 to 69, `critic-dispatch-preflight-tests` 389 to 406, `g23-read-help-tests` 20 to 36, `po-human-approval-signing-handoff-tests` 17 to 23. Only these four numbers change, with a QG-04 comment; names, paths, classifications and the other counts stay.

## Why

Found by the Full Verify of candidate 18 on the main-tree-equivalent clone (`VCR01` red, green at the candidate 17 base). No assertion is weakened: the suites grew.

## Verification (orchestrator, in a clone at the applied candidate 18 tree)

`check-verify-case-completion.test.mjs` 32/32 and `critic-dispatch-preflight.test.mjs` green after the whole fix chain w110 to w113. Patch applies to HEAD `8f23d7aa7` (`apply --check` exit 0).

## Apply order

After w109 (first of the fix patches; second apply script `po-apply-0.7-candidate18-fixes.sh`).

## Not proven

The counts are measured on the clone; the PO's Full Verify on the main tree is the proof.
