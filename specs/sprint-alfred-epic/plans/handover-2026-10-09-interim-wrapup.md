# Handover — Sprint Alfred, interim-candidate wrap-up (2026-10-09 late afternoon)

Runner-neutral. Written by the Claude Elephant on the main PC at the end of its budget (Ruling 164). The next session runs
under **WSL** with **Codex** or **Antigravity (agy)**. Nothing here is PO-accepted. **No interim stamp exists yet**: the PO
accepted wrapping up without one, so that no started block is half-finished in a candidate (Ruling 162).

Canonical anchors (read in this order): this file → `0.7-execution-order.md` Rulings 162–164 (newest at the bottom of
the "Ruling" list) → `po-list-2026-10-08.md` (decisions, signatures) → `toil-log-2026-10-06-07.md` (T124–T129). The previous handover
(`handover-2026-10-08-machine-switch.md` §0: signed tranche `da20519dd`, stamp; `next-actions-2026-10-08.md` §0) stays as
history.

## 0. Entry under WSL (both runners)

```bash
cd <repo-root-in-wsl>                 # the same checkout as the Windows side, e.g. under /mnt/<drive>/…
git status --short                    # expect the uncommitted items in §3 — do NOT discard them
git log --oneline -15                 # newest Elephant anchor: "Ruling 164" or later
export PIPELINE_TEST_TMP_BASE="$HOME/pipeline-test-tmp"; mkdir -p "$PIPELINE_TEST_TMP_BASE"   # mandatory for every onboarding test (DrvFs chmod, e59ac5750)
node plugins/pipeline-core/scripts/pipeline-start-preflight.mjs   # bootstrap; continue only on status ready
```

- **Codex:** start `codex` in `<repo-root-in-wsl>`, then run the pipeline-start skill (`/pipeline-core:pipeline-start`
  equivalent) — its preflight returns the exact next action. No Codex sandbox on native Windows; WSL only.
- **agy:** start the Antigravity CLI in `<repo-root-in-wsl>`, then the same bootstrap; model readback via
  `references/model-role-antigravity.md` of the pipeline-start skill.
- Long test captures: run them in the session's own background, each under 10 minutes, split with
  `--test-name-pattern` (T127). Native-Windows full Verify is forbidden (destabilises the PC); WSL only.

## 1. Blocks — status

| Block | State | Evidence / commits |
|---|---|---|
| TR-C (guard-push/guard-git tranche-2) | implementation-complete, review pending | `189130971`, manifests |
| TR-S1 (F2 integration, F4 key-copy) | implementation-complete, review pending | `5cd3c2f87`, `ef1ba84de` |
| ADOPT-SIGN (signable adoption request) | implementation-complete, review pending | `37862e295` (F), `2e875d021` (T2, 20/20 WSL) |
| WIN-AP-S6 | implementation-complete, review pending | `39051c5d7`, `cfd5d012b` |
| WIN-HGO-S, CSW | implementation-complete, review pending | `eba5e5a11`, `ae5b02b82` |
| GREP-PUSH | T done (`f06b434a2`, 27 red / 22 green); **F: see §2** | `GREP-PUSH-MANIFEST.md` |
| CRITIC-CKPT | T2/T3/T4 done (`902fe1b74`, `83563e149`, `e28888585`); **F2: see §2** | Ruling 163 (default Critic base cap stays 30) |
| WIN-HARDEN (SetOwner regress from `5a72c9b61`) | T2 done (`511f85f33`, WPS016 red) → **F2 open** | `specs/sprint-alfred-epic/evidence/win-ap-s5-d-gmw50-hardening-2026-10-09.md` |
| WIN-AP-S5 | blocked on WIN-HARDEN-F2; re-land with a native-before first | S5-D report §6 |
| ONB (greenfield walk defects F3/F4/F7/F9) | **T3: see §2** → ONB-F open | Ruling 163 (F3 language half ruled out) |
| E2E-ONB-B (walk to `submit-plan`) | B2 `143dab8de` (blocker F14); **B3: see §2** | `e2e-onb-b2-walk-2026-10-09.md` |
| E2E-ONB-A (suite matrix, WSL) | see §2 | `evidence/E2E-ONB-A2-20261009/` (ignored) |
| LE-F2 (line-ending gate) | edit in tree, uncommitted; see §3 | `onboarding-continuity` 298/298 on WSL |
| MECH-HAIKU (mechanic → Haiku, medium) | edits in tree, uncommitted, **after-capture RED**; see §3 | `evidence/MECH-HAIKU-F-20261009/after/` |

## 2. Returns still outstanding at writing time

Filled in below as they land (section 5). Dispatches alive at writing: GREP-PUSH-F, CRITIC-CKPT-F2, ONB-T3, E2E-ONB-B3;
Elephant captures: LE-F2 pattern run, E2E-ONB-A2 matrix, MECH-HAIKU after-capture (project-onboarding-v3 file).

## 3. Uncommitted work in the tree (do not discard)

- **LE-F2** — `plugins/pipeline-core/lib/onboarding-continuity.mjs`: `applyOnboardingIntakeGenerate` gates the line-ending
  block on `plan.repositoryCapability !== "local"` → `{ok:true, skipped:true}`. Verified: `onboarding-continuity` 298/298
  (WSL, TMPBASE), consumer-safe-paths green. Missing: the `onboarding-init` pattern capture. Commit as an orchestrator
  commit (`Dispatch: LE-F2-20261009 (goldfish)`, `AI-Assisted: true`, `Commit-Act: orchestrator`), pathspec only.
- **MECH-HAIKU** — `config/runner-mappings.json`, `config/routing-authority.json`, `agents/goldfish-mechanic.md`,
  `policies/model-policy.md` (EN half). The after-capture is red: `check-routing-projections` RP31 ("direct v1 Claude
  projection is semantically identical to Shared 654ebaf") still pins the old Sonnet/low legacy shape;
  `runner-profile-migration-v3` 14/60 red; `p3b-runner-conformance`, `runner-profile-migration-v2`,
  `runner-contracts.schema` each one top-level fail. Next: a classifier reads the captures; the expectations MECH-HAIKU-T
  missed go into a test-only slice (QG-04), then re-measure and commit with `scratch/commit-msg/MECH-HAIKU-F.txt`.
- **Foreign edits, never stage:** `harness/scripts/pipeline-state.test.mjs`, `lib/guard/sanctioned-args-onboarding.mjs`
  (staged), `scripts/pipeline-state.mjs`, `lib/project-onboarding-v3.test.mjs`, `lib/onboarding-continuity.test.mjs`,
  tranche-2 `hooks/guard-push.test.mjs` — check `git diff` before any commit; commit by pathspec only.

## 4. Remaining path to the interim stamp (in order)

1. Finish §3 (LE-F2 commit; MECH-HAIKU test slice → commit).
2. Fix slices, each after its RED pins: **ONB-F** (F3 argv, F4 nextAction parity, F7 typed next step, F9 placeholder
   refusal `BOOTSTRAP-ACK-PLACEHOLDER-CONTENT`); **F14** (`bootstrap-acknowledge-plan` honours `human_approval: chat`;
   `scripts/project-onboarding-v3.mjs:986-991`); **WIN-HARDEN-F2** (`SetOwner` only when the owner differs) → **WIN-AP-S5**
   re-land → **KL-REBASE**; **GREP-PUSH-F** if not landed (§5); **CRITIC-CKPT-F2** if not landed; **TRUST-T/F** (PO
   decision 2026-10-09: signature mode refuses an empty trust-anchor set with a typed code naming setup; first check
   onboarding pins the key before the boundary); F1/F2/F5/F8/F10–F13 friction slices; TT04 (`path.sep`).
3. **E2E-ONB acceptance gate:** re-run walk A (suite matrix) and walk B (fresh greenfield repo → `submit-plan`) on WSL.
4. Manifest checks (base blobs, verify-suites counts, host-path sweep); Verify-suite registration for new test files.
5. **ADOPT-P1** map refresh as the last code-adjacent edit; re-measure with `scratch/dispatch/elephant/push-currency.mjs`
   (if scratch is gone: `architecture-fitness.mjs --check --json --mode candidate` + entry readiness + push currency).
6. **One batched Opus Critic** (A/G/S: TR-C, TR-G, WIN-AP S3–S6, WIN-GES-F5, GREP-PUSH, CRITIC-CKPT, TR-S1, ADOPT-SIGN,
   ONB, WIN-HARDEN, TRUST) from `templates/prompts/critic-review.md`; follow-ups on the delta diff only; every other review
   one batched Sonnet Critic.
7. Quiet window: adoption ceremony (`architecture-adoption.mjs prepare --out scratch/…` with the four scopes of Ruling 162
   and `--decision-ref "Ruling 162"` → PO `po-human-approval.mjs sign-intent --request …` → `apply` with byte-identical
   flags), then the tranche-2 signing ceremony.
8. ADOPT-E evidence, interim stamp (labelled interim), handover. Known notes for it: the `e51844ab8` revert, the WIN-AP-S4
   install precondition, unverified whether win32 `os.uptime()` counts sleep.

## 5. Late returns (appended by the Elephant before close)

(none yet)
