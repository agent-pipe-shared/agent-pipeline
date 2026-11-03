# w141 — the authority revision apply refusal names the missing proof check (candidate 19, Q9, Claude Windows greenfield)

Applies on top of the chain at adf80d1e4. Elephant-built small item (PO exception for small items), built in a clone.

## What it changes

- `plugins/pipeline-core/scripts/pipeline-state.mjs`: the `AR-APPROVAL-UNAVAILABLE` refusal of `continuity-authority-revision-apply` now says that this command run alone has no PO proof check wired in, that the three flags are not enough, where the request and its digest come from (`continuity-authority-revision-plan --proposal-file <repo-relative-json>`), and that the apply goes through the signed authority-revision route, not through repeating the call. The code, the exit code (2) and zero mutation are unchanged.
- `harness/scripts/pipeline-state.test.mjs`: new case AR03d2 (code, the missing piece, the plan command and byte-identical State).

## Checks

- `pipeline-state.test.mjs` run alone in the clone: 532 of 532.

## Not changed / not proven

- No production route that injects `authorityRevisionApproval` was added; the refusal only tells the truth about the missing piece. The signed route itself is not rebuilt here (the wording "signed authority-revision route" names the existing concept, not a new command).
- The full Verify run was not made; no independent Critic review (suspended by the PO until a working local candidate exists).
