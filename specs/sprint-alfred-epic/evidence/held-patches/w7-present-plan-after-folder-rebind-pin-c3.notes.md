# Held patch c3: present-plan after a byte-identical feature-directory rebind

State: targeted delivery green; independent Critic review, Full Verify and PO acceptance pending (batch gates, parent-owned).
Patch: `w7-present-plan-after-folder-rebind-pin-c3.patch` (git diff --binary of the scratch clone against its local baseline = candidate + round-2 bundle). Supersedes c1 and c2 (those files are untouched). Files: `design-approval-route.e2e.test.mjs`, `pipeline-state.mjs`. The dispatch write scope listed only the test file; the production hunk (12 lines) travels inside the patch, as the briefing's "files that may differ" allows.

## Production change (pipeline-state.mjs, `readDesignApprovalInputs`)
Local helper `moved(path)`: when the PRD directory of the latest receipt (`fromDir`) differs from the submission's PRD directory (`toDir`) and the path sits under `fromDir/`, it returns the same relative position under `toDir` if that file exists (`physicalRebindFile` not null), else the receipt's own path. It is the identity when the directory is unchanged. Applied to the companion paths and to each receipt summary's report path.
Fixture (test only): with `move`, the review report is also `git mv`-ed to the new directory; receipt JSON files stay.

## DABX010 justification
`readDesignApprovalInputs` runs `checkDesignConsistency`; for the changed-byte case it returns not-ok (inconsistency code), and the present-plan route (line ~14215) collapses every not-ok into `SDC-AUTHORITY-UNAVAILABLE: companion-presentation-original-receipts`. So the refusal is correct and fail-closed: DABX009 (byte-identical move) passes through the same function, so the refusal is caused by the content change, not by the move. A moved package whose bound sha256 differs cannot be presented. Only the expectation changed: still non-zero exit, no request, no presentation recorded, and now also no success output; stderr must name `SDC-AUTHORITY-UNAVAILABLE ... companion-presentation-original-receipts` or the review-chain codes. The case name is unchanged (declared list). Property under test (content change after a move is refused) is kept; the typed code differs because the route-level companion check runs first.

## Results
- RED (from c2 notes): DABX009..012 failed with SDC-AUTHORITY-UNAVAILABLE companion-presentation-original-receipts.
- GREEN: clone, whole `design-approval-route.e2e.test.mjs`: tests 18, pass 18, fail 0, exit 0 (log `scratch/agent-out/w7rf/green2.design-approval-route.e2e.test.mjs.log`). Baseline clone2: 14 pass, 0 fail.
- `pipeline-state.test.mjs`: clone (patched) exit 1 and clone2 (baseline) exit 1, same uncaught `ERR_ASSERTION` deepStrictEqual (actual `[{area:'application',status:'ready',...}]`, expected `[]`) in the printed tails. Pre-existing, fails identically in both; only the printed tail was compared (no per-test list, the reporter aborts). Logs `ps.*` and `basePS.*` in `scratch/agent-out/w7rf/`.
- Apply check in clone2 (bundle baseline): `git apply --check` exit 0.

## Defaults assumed
Receipt files stay; fresh signature always required after a rebind.

## NOT done
Independent Critic, Full Verify, PO acceptance; per-name comparison of the state test (aborts on the pre-existing assertion).

## Commit message
`fix(state): present-plan after a byte-identical feature-directory rebind needs no new review round`

## Operator flow
Apply round-2 bundle v3 (includes the pathRebind patch) first, then this patch; `git add -u` with a path limit; `--no-verify` commit; stamp; install.

## Classification
Kernel path (state machine, design approval route). Neither file matches TP-1..TP-13.
