# State authority route: diagnostics (names an untyped failure, elapsed time, opt-in trace), verification and PO apply blocks (2026-10-28)

Two patches, applied in this order and committed as ONE commit: `w7-state-authority-diagnostics-e1b.patch` (6 files) then `w7-state-authority-diagnostics-e1c.patch` (4 files, corrects the first).
Both apply on the installed bindings candidate (stamp `a49fe0524`, `0.7.0+claude.20261028220411.b1ae581`). This is a HELD PATCH: nothing in it is applied, stamped, installed, reviewed or accepted until
the PO has done so. Recon: `STATE-AUTHORITY-DIAGNOSTICS-RECON-2026-10-28.md`; notes: the two `.notes.md` files next to the patches. The first patch alone breaks one external ledger case
(PSXL05) and puts its new cases into a test file that already stops at an earlier case in the baseline; the second patch removes both problems, so never apply the first alone.

## What changes (diagnostics only, no behaviour change)

1. `pipeline-state.mjs`: the refusal line of the state authority route is built by an exported pure function `describeStateAuthorityRefusal`. A typed error prints exactly as before plus
   ` Elapsed: <n> ms.` after the repair sentence. An error without a string reason keeps `(<code>)` as before (code defaults to `SDC-AUTHORITY-UNAVAILABLE`) and now adds `; cause: untyped <Name>: <message,
   one line, 240 characters>; at <two bare frames>` after the parenthesis, so the real cause is no longer dropped. A non-Error throw prints `cause: untyped <typeof>`.
2. Opt-in trace: with `PIPELINE_AUTHORITY_TRACE=1` the command writes one `AUTHORITY-TRACE {json}` line to stderr when it ends (success or refusal): elapsed milliseconds, count, total and longest
   milliseconds of custody inspections (git reads) and of native Windows spawns (the private-state module and the owned-authority backend, which also reports a per-operation count map and failed
   spawns). Unset: no output. Counters are plain module-level numbers in `worktree-lifecycle.mjs`, `windows-private-state.mjs` and `windows-owned-authority-backend.mjs`.
3. Cases `SAS01` to `SAS08` (named SAD diag (1) to (8) in their titles) run in `session-authority-repair.test.mjs`; the repair suite's count pin in `check-verify-case-completion.test.mjs` is raised for them.

## Test evidence (fresh clone of HEAD, both patches applied as one commit)

| File | tests | pass | fail |
|---|---|---|---|
| `plugins/pipeline-core/scripts/session-authority-repair.test.mjs` | 29 | 29 | 0 |
| `harness/scripts/pipeline-state-external-push-ledger.test.mjs` | 1 (5 checks) | 1 | 0 |
| `plugins/pipeline-core/lib/windows-private-state.test.mjs` | 24 | 20 (4 skipped on Linux) | 0 |
| `harness/scripts/check-verify-case-completion.test.mjs` | 32 | 32 | 0 |
| `harness/scripts/check-product-capability-inventory.test.mjs` | 30 | 30 | 0 |

`generate-architecture-overview.mjs --check` prints "Architecture overview current". With the first patch alone the ledger suite failed at PSXL05 (measured); the second patch makes it green again.
`harness/scripts/pipeline-state.test.mjs` stops at its case PS08a in the unpatched baseline (`legacy.planApproval` undefined after a plan-submit source drift): that is pre-existing, reproduced in a
clean worker clone, unrelated to this work and recorded as an open baseline red. Full Verify is not run.

## Named gaps and gates (not done)

- The trace measures; it does not speed anything up. The memo for the repeated native observations (recon item 5, the one PowerShell start per operation in the owned-authority backend) is the next
  slice and needs the trace numbers from a native Windows run first. No Windows run was possible here: the Windows counters are exercised only through the recording helper.
- The native Windows run of the trace, Full Verify, the batch Critic, D31 native qualification and PO acceptance stay open.

## PO apply blocks (from the repository root)

Block 1:
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-state-authority-diagnostics-e1b.patch`
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-state-authority-diagnostics-e1c.patch`
then `git status --short` (expect `pipeline-state.mjs`, the three lib modules, `session-authority-repair.test.mjs`, `check-verify-case-completion.test.mjs`).

Block 2:
`git add -A -- plugins/pipeline-core harness/scripts`
`git commit --no-verify -F scratch/commit-msg-po-apply-state-diag.txt`

Block 3, tell the Elephant: it stamps, you refresh the installed plugin copy and install, the Elephant reads the preflight back.

## For the Windows consumer after the install

Run the failing command once with `PIPELINE_AUTHORITY_TRACE=1` (PowerShell: `$env:PIPELINE_AUTHORITY_TRACE='1'`, then the command, then `Remove-Item Env:PIPELINE_AUTHORITY_TRACE`) and send the one `AUTHORITY-TRACE`
line plus the refusal line. They name the count of native spawns per operation, their total and longest time, and the real cause of an untyped failure.
