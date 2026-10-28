# Held patch: record a feature-directory path rebind in the signed design approval binding (Phoenix Wanted 4, slice 2)

State: HELD patch, implementation complete in a scratch clone, targeted checks green; NOT applied to the repository, NOT committed.
Candidate 2ebe5e1bb plus the round-2 bundle v2 (`scratch/agent-out/compose/bundle.patch`, which carries slice 1 in
`design-consistency-check.mjs`). Patch: `w7-design-approval-path-rebind-record.patch` (diff against the bundle baseline).
Files in the patch: `plugins/pipeline-core/lib/design-approval-binding.mjs`, `plugins/pipeline-core/lib/design-approval-binding.test.mjs`.
Nothing else differs. Recon claims re-verified against the clone: `createDesignApprovalBinding`, `copySources`,
`verifyDesignApprovalRequest` (`canonical(request.binding) !== canonical(recomputed.binding)` -> `DAB-BINDING-DRIFT`) are as the recon
describes; slice 1 `sourceRebind` in the bundle is a module-private function (not exported).

## Defaults assumed (PO decision pending)
1. Review receipt files STAY where they are: the binding keeps `reviewReceipts[].path` as the receipts live; only `sources.*.path` follow the move.
2. A rebind ALWAYS needs a fresh signature: the binding digest changes (pathRebind plus moved source paths), so a request signed before the move
   fails `DAB-BINDING-DRIFT`. No silent carry-over exists.

## Rule as implemented
- New private `sourceRebind(reviewed, current)` in `design-approval-binding.mjs`: the same equality as slice 1, implemented locally because the
  slice 1 helper is not exported and `design-consistency-check.mjs` is outside the write set. Returns `{fromDir, toDir}` only when companion counts
  match, the PRD directories differ and are safe, every PRD/Spec/companion pair (companions by sorted index) has an identical relative suffix under
  its own directory, every sha256 is equal (and a hex digest, so a deleted companion with null never rebinds), and each current path is safe.
- `createDesignApprovalBinding`: after the chain check, `rebind = sourceRebind(latest.sources, currentSources)`; when non-null the binding gets
  `pathRebind: {fromDir, toDir}`; the path-keyed `unreviewedSourceDelta` is skipped when a rebind exists (byte-identical move is not a delta).
  Without a rebind nothing changes: same keys, same bytes, same digest.
- `BINDING_OPTIONAL_KEYS` gains `pathRebind` only.
- `validateDesignApprovalBinding`: `pathRebind` must be exactly `{fromDir, toDir}`, both safe-path strings, distinct, and `toDir` must be the
  PRD's directory with Spec and all companions under `toDir/`. Extra keys, missing keys, unsafe paths, non-strings, arrays are `DAB-SHAPE`.
- `verifyDesignApprovalRequest` is unchanged: it recomputes through `createDesignApprovalBinding`, so pathRebind is part of the compared binding.

## Cases (appended to `design-approval-binding.test.mjs`, ids U3-22 .. U3-27, none existing was edited)
- U3-22 rebind-equal move gives pathRebind and a different digest; U3-22b delta chain moved gives pathRebind and no unreviewedSourceDelta;
  U3-23 no rebind keeps bytes/digest equal to a hand-assembled legacy binding; U3-24 pre-move request is `DAB-BINDING-DRIFT` after the move;
  U3-25 post-move request verifies; U3-26 moved plus one changed hash is `DAB-REVIEW-CHAIN`/`DCC-REVIEW-RECEIPT-BINDING`, no binding;
  U3-27 validate accepts the record and rejects extra key, missing key, traversal, absolute, backslash, trailing slash, number, null,
  equal dirs, toDir not the sources' directory, string, array.
- RED (clone, unchanged code, log `scratch/agent-out/w7re/red.design-approval-binding.test.mjs.log`): 3 fail (U3-22, U3-22b, U3-27), 4 pass.
  U3-23..U3-26 pass on the old code by design: they are regression guards for behaviour that must NOT change (old code already refuses a pre-move
  request, since moved source paths differ).
- GREEN (clone): design-approval-binding.test.mjs 49 tests, 49 pass, 0 fail; design-consistency-check.test.mjs 60 tests, 60 pass, 0 fail.
- Baseline clone2 (bundle only): design-approval-binding.test.mjs 42 pass, 0 fail; design-consistency-check.test.mjs 60 pass, 0 fail.
- Failing-name sets: baseline empty, patched empty (identical; no pre-existing failures).
- Apply check: `git apply --check` of the patch in clone2 (bundle applied and committed as baseline), exit 0.

## NOT done
- Slice 3: the present-plan pin in `pipeline-state.mjs` (`readDesignApprovalInputs` / `present-plan` after a rebind).
- PO decision on whether receipt files move with the folder and the re-signature rule (defaults above are assumptions).
- No change to `design-review-receipt.mjs`, `po-gate-authority.mjs`, `pipeline-state.mjs`, `design-consistency-check.mjs`.
- A delta receipt whose files moved AND changed keeps the old path-keyed unreviewed delta and records no pathRebind (hash difference means no rebind).
- Whole-suite Verify, native run, PO acceptance: parent-owned. A signed-binding change needs the independent Critic (batch gate, parent-owned).

## Proposed commit message
`feat(design-approval): record a feature-directory path rebind in the signed approval binding`

## Operator flow
Apply the round-2 bundle v2 first, then this patch: `git apply w7-design-approval-path-rebind-record.patch`, `git add -u -- plugins/pipeline-core/lib/design-approval-binding.mjs plugins/pipeline-core/lib/design-approval-binding.test.mjs`,
`--no-verify` commit with the message above, then stamp and install.

## Classification
Kernel path, signed PO approval binding (security-relevant): lib kernel source, held patch applied by the operator. Neither file matches TP-1..TP-13.
Critic T1: required, independent, batch gate owned by the parent.
