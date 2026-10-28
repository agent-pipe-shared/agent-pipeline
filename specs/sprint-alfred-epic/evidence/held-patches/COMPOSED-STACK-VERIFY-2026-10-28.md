# Round-2 held-patch bundle v2, verification and PO apply blocks (2026-10-28)

Bundle: `w7-round2-bundle-v2-2026-10-28.patch` (37 files, +1980/-113). It stacks on the tree that already
contains the earlier bundle and increment (installed at 4ea7a86b7). It applies cleanly with `git apply`
on a fresh clone of the repository HEAD (chain check). It is a HELD PATCH: nothing in it is applied,
stamped, installed, reviewed or accepted until the PO has done so.

`w7-round2-bundle-2026-10-28.patch` (v1, 13 patches) is superseded by v2 (the same 13 plus two more).
Apply only ONE of the two, never both. Superseded partials are listed in
`SUPERSEDED-PARTIALS-2026-10-27.md`; never apply those.

## Contents, in apply order (15 patches)

1. `w7-d56-admit-attested-record-c2`: admission of the orchestrator-attested record kind (Critic skip coverage).
2. `w7-d56-binding-assurance-c3`: assurance in the binding, generic batch kind cases.
3. `w7-d56-attested-writer-cli`: `dispatch-record-write.mjs --attested-request` writer CLI.
4. `w7-phoenix-feature-directory-from-prd`: Phoenix feature directory derived from the PRD.
5. `w7-preflight-scanner-findings-c2`: toolchain preflight scanner findings.
6. `w7-preflight-no-sudo-install-actions`: no sudo in preflight install actions.
7. `w7-phoenix-reopen-design-dry-run-c4`: reopen-design dry run.
8. `w7-d56-attested-writer-guard-admission`: guard admission of the attested writer argv.
9. `w7-d52-checkpoint-commit-route-c2`: `checkpoint-commit.mjs` plus the `Checkpoint-Act` trailer admission.
10. `w7-pf86-registry-read-api-c6`: lock-free registry read API.
11. `w7-d31-briefing-checkpoint-return-c2`: generated briefing tells a Goldfish to return `outcome: "checkpoint"`.
12. `w7-d56-chain-test-and-refusal-text-c3`: end-to-end attested-record chain test and the admission refusal text.
13. `w7-d31-budget-notice-checkpoint-c2`: budget notice returns `checkpoint` instead of `blocked`.
14. `w7-design-consistency-byte-identical-rebind`: a byte-identical feature-directory rebind keeps its design review
    receipts (additional clause beside canonical equality; any hash, role, count or layout change still refuses).
15. `w7-half-moved-repair-lane-powershell`: the exact `git mv` / `git restore` repair commands under PowerShell.

## Test evidence (composed clone, 17 touched test files)

All pass except `lib/critic-generic-batch.test.mjs`: 26 pass, 2 fail (CGB002, CGB003,
`SCF-ORIGINAL-SOURCE-UNAVAILABLE`). The same two cases fail identically on the unpatched repository tree
(baseline 26 tests, 24 pass, 2 fail), so they are pre-existing and not caused by this bundle.
Counts: grant notice 16/16, budget guard 125 pass and 2 skipped, guard-lifecycle-ready 411 pass and 3 skipped,
commit-message-policy 42/42, design-consistency-check 60/60, devplan-shell-sanctioned-recovery 52/52,
native-goldfish-host-state 56/56, host-commit pin file 17/17, po-gate-authority 1/1, check-critic-skip-coverage 48/48,
checkpoint-commit 6/6, critic-packet-preflight 17/17, dispatch-authorship-verify 73/73, dispatch-record-write 31/31,
pipeline-state-observer-conformance 18/18, toolchain-preflight 53/53.
Not run: Codex and Antigravity pretool guard test files (they share the PowerShell lane code), any dedicated
PowerShell dialect test, Full Verify.

## For the batch Critic (kernel and custody parts)

Guard and kernel files touched: `lib/guard/command-catalogue.mjs`, `lib/guard/constants.mjs`,
`lib/guard/sanctioned-args-scripts.mjs`, `lib/guard/write-scope.mjs`, `lib/guard/powershell-dialect.mjs`,
`lib/commit-message-policy.mjs`, `lib/po-gate-authority.mjs`, `lib/session-authority-registry.mjs`,
`lib/native-goldfish-host-state.mjs`, `lib/design-consistency-check.mjs`, `scripts/dispatch-authorship-verify.mjs`,
`scripts/pipeline-state.mjs`, `lib/dispatch-budget-notice.mjs`, `lib/dispatch-briefing-build.mjs`.
Whether a hunk is a protected path (TP list in `templates/prompts/agent-obligations.md` §2) was not re-measured
for the composed bundle; if the guard refuses a hunk during apply, use the PO approval ceremony for that file.
New test file needing Verify registration: `scripts/checkpoint-commit.test.mjs` (`harness/scripts/verify.mjs`,
protected). The PowerShell patch deviates from the recon: the PowerShell scope verdict returns before the
lifecycle gate, so the dialect itself observes readiness (session intent, invalid observation only); a Critic
should read that ordering claim first. The rebind patch changes what a signed review chain accepts: Critic required.

## PO apply blocks (from the repository root, in this order)

Block 1, apply and look: `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-round2-bundle-v2-2026-10-28.patch`
then `git status --short`.

Block 2, stage with a path limit and commit with your own ceremony: `git add -A -- plugins/pipeline-core`.

Block 3, synchronize the installed plugin copy, then stamp and install per `docs/push-release-flow.md` and
`docs/operating-tools.md` (`scripts/stamp-candidate.mjs`).

## Decisions only the PO can take

- D31 grant headroom rule (budget notice now says `checkpoint`; the headroom figure is still open).
- Whether an orchestrator-attested dispatch record is acceptable Critic-admission evidence (PF-82; recommended
  yes, with the weaker `orchestrator-attested` label, which is what slices 1 to 3 implement).
- PF-85 slice 1a (declared continuation of a still-reserved predecessor). A cancelled predecessor already does
  not block its successor (`native-goldfish-host-state.mjs`, `orderAndCoverAdmittedSlice`), so the cancel route
  covers the common case; the extra case needs a package schema field. Recommended: after the install.
- Whether review receipt files move with a renamed feature folder, and whether the PO signature is re-requested
  after a rebind (it must be; the binding digest changes). Needed before the `pathRebind` binding slice.

## Not in this bundle

`pathRebind` recorded in the signed approval binding (security-relevant, PO re-signature), the `present-plan`
pin for a folder rebind, PF-85 1a, Windows-native proofs of the PowerShell lane (NTFS case and 8.3 behaviour,
junction detection, real git.exe, PowerShell payload spelling), and the remaining baseline-red test files.
Critic, Full Verify, native Windows run and PO acceptance stay open. After install the matrix rows of the
applied patches may be lifted to 75.
