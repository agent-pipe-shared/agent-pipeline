# Round-2 held-patch bundle v5, verification and PO apply blocks (2026-10-28)

Bundle: `w7-round2-bundle-v5-2026-10-28.patch` (47 files, +2333/-147, 24 patches). It stacks on the tree that already
contains the earlier bundle and increment (installed at 4ea7a86b7). It applies cleanly with `git apply`
on a fresh clone of the repository HEAD (chain check, base 80cc913cb). It is a HELD PATCH: nothing in it is applied,
stamped, installed, reviewed or accepted until the PO has done so.

Apply only ONE round-2 bundle. v1 (`w7-round2-bundle-2026-10-28.patch`, 13 patches), v2
(`w7-round2-bundle-v2-2026-10-28.patch`, 15), v3 (`w7-round2-bundle-v3-2026-10-28.patch`, 17) and v4
(`w7-round2-bundle-v4-2026-10-28.patch`, 22) are superseded by v5 (v4 plus one fixture repair and one production fix).
Superseded partials are listed in `SUPERSEDED-PARTIALS-2026-10-27.md`; never apply those.
Do NOT additionally apply `w7-observer-conformance-fixture-commit.patch`: patch 7 of this bundle already adds the same
initial commit to the same helper (applying both conflicts), and the seven observer-conformance reds are fixed by the bundle.

## Contents, in apply order (24 patches)

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
16. `w7-design-approval-path-rebind-record`: the signed approval binding records the move as a closed optional
    `pathRebind {fromDir, toDir}`; bindings without a move stay byte-identical.
17. `w7-present-plan-after-folder-rebind-pin-c3`: the approval route reads its inputs after a byte-identical move
    (the state machine remaps companion and report paths under the old PRD directory to the same relative position
    under the new one when that file exists, identity otherwise) with four end-to-end cases.

New in v4, baseline-red test repairs (TEST FILES ONLY, no production line; each is a stale expectation or fixture
measured against the clean tree, details in the notes next to each patch):

18. `w7-critic-generic-batch-origin-fixture`: the review helper passes `allowCallerAuthoredFallback: true` (1 line).
    CGB002 and CGB003: 24 of 26 before, 28 of 28 in the composed clone.
19. `w7-pipeline-state-neutral-only-fixture-c3` (+14/-5): the plugin `scripts/pipeline-state.test.mjs` aborted at its
    first loop case; the fixture owns the planned path through its materialized design package, the calibration bytes
    are built before the architecture fixture, and the architecture is re-adopted before the replay step. The whole file
    now ends with `all checks passed`.
20. `w7-codex-pretool-guard-ready-fixture` (+6/-3): the ready lifecycle fixture pins the one current stop kind
    `design-authoring-required`. Plain `node` run in a scratch clone: 38 of 39 checks ok (13 red before).
21. `w7-catalogue-admit-d64-pin` (+10/-4): the D64 case pins the governed admission of the exact bootstrap argv
    (K152 part 3, commit e9e866fec). 21 of 22 before, 22 of 22 after.
22. `w7-guard-dispatch-test-fixtures-c2` (+27/-11): guard copy gets its `scripts` entry and the write-carrier allow
    expectations follow the deliberate carrier policy. 53 of 75 before, 60 of 75 after; the 15 remaining reds are a
    subset of the 22 baseline reds (none new).

New in v5 (found by the recon of the remaining baseline reds, `w7-recon-baseline-reds-c.notes.md`):

23. `w7-push-init-fixture-publication-review` (+3, test only): the all-green prepare dependencies neutralise the
    publication review gate (`critic-bound-verify`, CBV-ROOT) through its two existing seams. push-init: 23 of 32
    before, 32 of 32 in the composed clone. The first recon blamed the architecture gate wrongly; the stop report and the
    correction are in `w7-push-init-fixture-architecture-readiness.notes.md`.
24. `w7-doc-reconciliation-ls-files-buffer` (+36/-1, PRODUCTION): `harness/scripts/check-doc-reconciliation.mjs` listed
    tracked files with Node's default 1 MiB `spawnSync` buffer; this repository now lists 1199748 bytes, so the call
    failed (`GIT-LS-FILES-ERROR`, git exited null, exit 2). That makes layer 1b of a real push on this repository fail,
    not only a test. The patch sets `maxBuffer: 1 << 28` on that call and adds one case with an index-only fixture above
    1 MiB (RED before, 23 of 23 after). The range diff listing in the same file could overflow in theory; follow-up.

## Test evidence (composed clone, 25 touched test files, `node --test <file>`)

Everything passes except two files:
- `hooks/guard-dispatch.test.mjs`: 75 tests, 60 pass, 15 fail. All 15 are baseline reds, see below.
- `hooks/codex-pretool-guard.test.mjs`: prints `tests 1 pass 0 fail 1` under `node --test` because the file brings its own
  `ok N` reporter. Run with plain `node` in a scratch clone it gives 38 ok of 39; the one `not ok` is check 7, which
  requires the synthetic HOME that `scripts/run-parallel.mjs` provides (and a `scratch/` directory in the clone).
  Under the repository runner it is expected green; that is NOT yet confirmed.

Counts: grant notice 16/16, budget guard 125 pass and 2 skipped, guard-lifecycle-ready 411 pass and 3 skipped,
commit-message-policy 42/42, critic-generic-batch 28/28, design-approval-binding 49/49, design-consistency-check
60/60, devplan-shell-sanctioned-recovery 52/52, native-goldfish-host-state 56/56, catalogue-admit pin file 22/22,
host-commit pin file 17/17, po-gate-authority 1/1, check-critic-skip-coverage 48/48, checkpoint-commit 6/6,
critic-packet-preflight 17/17, design-approval-route e2e 18/18, dispatch-authorship-verify 73/73,
dispatch-record-write 31/31, pipeline-state-observer-conformance 18/18, pipeline-state (plugin) passes,
toolchain-preflight 53/53, push-init 32/32, check-doc-reconciliation passes (23 cases).

Baseline reds still open after v5 (all pre-existing on the clean tree):
- `guard-dispatch.test.mjs`, 15 names (positional ids): group C, ten checks (GD22, GD27, GD58 to GD65) fail on
  `DBG-GENERATED-BRIEFING-REQUIRED` and need generator-built briefings; two of them (incomplete briefing, filled template)
  cannot keep their property without forging the sha256 marker. Group B, five checks (GD34, GD36, GD38, GD39, GD43): the
  write-carrier check runs before the typed ROLE-REQUIRED / ROLE-UNKNOWN / PROMPT-REQUIRED findings.
- `harness/scripts/pipeline-state.test.mjs` (protected TP-5, not touched, not run), Q9 D55 library suite,
  `lib/guard/sanctioned-args-scripts` consumers (only the D64 case was red; now fixed), and the other files of the
  2026-10-27 list. Fixed by v5: observer-conformance (through patch 7) and push-init (patches 23, 24). Measured and
  classified but not fixed (see `w7-recon-baseline-reds-c.notes.md`): parallel-work PARWORK-M6a/c/d/e/f (fixture needs a
  generator-built briefing, same family as guard-dispatch group C) and configure-verify-names (3 cases expect a
  `repair` clause the refusal never carries; production or pin ahead of its fix, undecided). Classified by a second
  pass, not fixed (all red in the real checkout too, none environmental): approve-announce and
  plan-authority-staging-guard (architecture gate at `submit-plan`, fixture), onboarding-continuity OBC264
  (`BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED`, fixture binds unauthored generated design bytes), project-onboarding-e2e
  and measure-tofu (the driver ends `unsupported-next-action` where the pin expects an error code; needs a decision
  which outcome is intended), consumer-approved-plan (g) (refusal wording changed, pin stale). Not measured:
  project-onboarding-v3; the Q9 D55 suite name does not resolve.
Not run: Antigravity pretool guard test file, any dedicated PowerShell dialect test, Full Verify.

## For the batch Critic (kernel and custody parts)

Guard and kernel files touched: `lib/guard/command-catalogue.mjs`, `lib/guard/constants.mjs`,
`lib/guard/sanctioned-args-scripts.mjs`, `lib/guard/write-scope.mjs`, `lib/guard/powershell-dialect.mjs`,
`lib/commit-message-policy.mjs`, `lib/po-gate-authority.mjs`, `lib/session-authority-registry.mjs`,
`lib/native-goldfish-host-state.mjs`, `lib/design-consistency-check.mjs`, `lib/design-approval-binding.mjs`,
`scripts/dispatch-authorship-verify.mjs`, `scripts/pipeline-state.mjs`, `lib/dispatch-budget-notice.mjs`,
`lib/dispatch-briefing-build.mjs`. Whether a hunk is a protected path (TP list in
`templates/prompts/agent-obligations.md` §2) was not re-measured for the composed bundle; if the guard refuses a hunk
during apply, use the PO approval ceremony for that file. New test file needing Verify registration:
`scripts/checkpoint-commit.test.mjs` (`harness/scripts/verify.mjs`, protected). The five v4 patches touch no
protected test path (observed for each, none matches TP-1 to TP-13).

Read first, in this order:
- The PowerShell patch deviates from the recon: the PowerShell scope verdict returns before the lifecycle gate, so
  the dialect itself observes readiness (session intent, invalid observation only).
- Three patches change what a signed design review chain accepts (14, 16, 17): the rebind clause, the recorded
  `pathRebind` and the path remap in the state machine. The remap hunk in `scripts/pipeline-state.mjs` was outside the
  dispatch write scope list and travels in the patch. The refusal for a moved package with a changed byte is the
  companion check (`SDC-AUTHORITY-UNAVAILABLE: companion-presentation-original-receipts`), fail-closed, not a
  review-chain code; its test accepts either.
- The test repairs 18 to 22 change EXPECTATIONS, not strength: each carries a QG-04 comment. Check that they really pin
  the production contract and do not paper over a defect, above all patch 22 (the carrier policy refuses Plan,
  general-purpose, Codex `worker` and a missing Codex type, and a Workflow-transport Explore) and patch 20 (one stop kind
  for every caller of the ready fixture).

## PO apply blocks (from the repository root, in this order)

Block 1, apply and look: `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-round2-bundle-v5-2026-10-28.patch`
then `git status --short`.

Block 2, stage with a path limit and commit with your own ceremony: `git add -A -- plugins/pipeline-core`.

Block 3, synchronize the installed plugin copy, then stamp and install per `docs/push-release-flow.md` and
`docs/operating-tools.md` (`scripts/stamp-candidate.mjs`).

## Decisions only the PO can take

- Rebind defaults assumed by patches 16 and 17: review receipt files STAY where they are (the binding keeps pointing
  at wherever they live), and a rebind ALWAYS needs a fresh signature (a request signed before the move fails with
  `DAB-BINDING-DRIFT`). Confirm or change.
- D31 grant headroom rule (budget notice now says `checkpoint`; the headroom figure is still open).
- Whether an orchestrator-attested dispatch record is acceptable Critic-admission evidence (PF-82; recommended
  yes, with the weaker `orchestrator-attested` label, which is what patches 1 to 3 implement).
- PF-85 slice 1a (declared continuation of a still-reserved predecessor). A cancelled predecessor already does
  not block its successor (`native-goldfish-host-state.mjs`, `orderAndCoverAdmittedSlice`), so the cancel route
  covers the common case; the extra case needs a package schema field. Recommended: after the install.
- Admission of the model-role bootstrap (patch 21): no D-numbered register entry governs it; the only record is
  commit e9e866fec (K152 part 3, greenfield finding G7). Confirm that admitting exactly
  `--repo-root <root> --runner codex|claude|antigravity` is intended.
- Write-carrier policy (patch 22): confirm that Plan, general-purpose, Codex `worker`, a missing Codex type and a
  Workflow-transport Explore are meant to be refused, and decide the guard order for the five group B checks (typed
  packet findings before or after the carrier check). The guard file is a custody file; no production edit is in v4.
- `set-phase --verify-command` rewrites the calibration bytes that an adopted architecture profile binds, so the
  next entry hits profile drift unless the architecture is re-adopted (patch 19 re-adopts in the test). Intended, or a
  production gap?

## Not in this bundle

PF-85 1a, Windows-native proofs of the PowerShell lane (NTFS case and 8.3 behaviour, junction detection, real
git.exe, PowerShell payload spelling), the Antigravity pretool test run, guard-dispatch groups B and C, the other
baseline-red test files named above. Critic, Full Verify, native Windows run and PO acceptance stay open. After install
the matrix rows of the applied patches may be lifted to 75.
