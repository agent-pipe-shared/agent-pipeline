# w57 — a design signature is refused before the prompt while `pipeline.user.yaml` is not part of HEAD (candidate 17, slice 12)

Applies on the nine-patch chain; touches `scripts/po-human-approval.mjs` and its test only.

## What went wrong

An Antigravity greenfield run showed the PO signing the plan decision twice. The first `sign-intent` printed `selected approval mode: signature (uncommitted)` and went on to the passphrase
prompt, because `pipeline.user.yaml` (the file that names the approval mode) was untracked and only observed as optional. The agent then committed that file, which moved the candidate
commit and tree the signature is bound to, and `approve-plan` refused the proof (`CAC-SOURCE-UNAVAILABLE`). A fresh request and a second signature followed.

## Change

- `designSigningApprovalModeRefusal(mode)` (exported): returns a typed error `DAB-SIGN-APPROVAL-MODE-UNCOMMITTED` when the mode source reads `uncommitted` (untracked, edited or deleted against HEAD),
  with the repair: commit the file or restore it, rebuild the request with `present-plan`, sign once.
- `observeDesignApprovalSigningRequest` throws it right after the mode is read, before any other use; the catch hands it through (like `PO-SIGN-GIT-UNAVAILABLE`) instead of collapsing it into
  the generic `DAB-SIGN-REQUEST-INVALID`. The top-level handler prints it as `PO-HUMAN-APPROVAL-FAILED: <message>`, exit 2, before the passphrase prompt is built.
- Test: a real temporary git repository walks the four states (no mode file, untracked file, committed file, edited file) and pins the two call sites in the source.
  Mutation-checked: with the condition made unreachable the case is red; the original restored from backup. Whole `po-human-approval.test.mjs` passes (195).

## Not changed / not proven

- Only the design-approval signing request is covered. Other sign-intent kinds read the mode through the same function but were not changed; the push and critical-proof paths already
  bind a clean candidate. Not walked end to end with a real key and passphrase.
- Whether `approve-plan` itself should say "commit pipeline.user.yaml" when it refuses is a separate wording item.
