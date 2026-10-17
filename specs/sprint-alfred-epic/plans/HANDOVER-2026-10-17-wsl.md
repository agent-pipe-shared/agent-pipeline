# Handover to the WSL session, 2026-10-17

Status: the 0.7.0 local candidate. Implementation is in, but there is no Full Verify,
no Critic batch and no PO acceptance. Nothing is "done".

## Read first

1. [`docs/state.md`](../../../docs/state.md), top section.
2. [Current item status](../evidence/delivery-status-current.md). It is the only work list:
   per item, the stage and what is still open, with an owner. Do not re-derive status
   from older matrices or chat.
3. [Decision log](po-decisions-2026-10-12.md), section "Cut for the 0.7.0 candidate".
   - No new topics, only closing steps.
   - Blocker and major findings from tests or the Critic are always fixed, scoped to
     the finding. Minor findings and Windows host-class reds are recorded.

## Closing steps, in order

1. Sync the WSL clone to the exact stamp commit
   ([runbook](wsl-candidate-sync-runbook.md)) and run one Full Verify there.
2. Run one Critic batch on Sonnet, built from `templates/prompts/critic-review.md`.
   Per the PO budget: one FULL review plus at most three DIFF reviews. Its scope:
   - the items at stage 75 in the current status (each needs confirmation);
   - the Windows product changes, whose DIFF moved here from the Windows session:
     `bf9040f27` (model-role-host-store), `915ef21c2` (ancestor callers bounded at the
     repository root), `8869464c2` (plugin-root boundary and registry ENOENT parity),
     and `0b06f4092` (verify-evidence-producer boundary, unverified; see below).
3. Fix every blocker and major finding, scoped. Rerun only the affected suites.
4. Rerun `specs/sprint-alfred-epic/tools/delivery-remeasure.mjs` and commit the new
   snapshot.
5. Prepare PO acceptance lists in blocks from the snapshot.

## Open findings from the Windows session, with their measurements

These are recorded and were not chased under the cut. Build on them; do not
rediscover them.

- **Fixtures under `%TEMP%` (host class, Windows only).** On the Windows host,
  `%TEMP%` grants the Codex sandbox group Modify, and every `mkdtemp` child inherits
  that grant. The strict check correctly refuses such a repository root.
  - The existing helper `mkdtempTestScratch` (`plugins/pipeline-core/lib/test-tmpdir.mjs`)
    places fixtures under `scratch/test-tmp/` instead.
  - Still open: move `os.tmpdir()` fixtures onto that helper, or have the Verify runner
    set TEMP/TMP for child suites. The runner route needs a signature, because
    `harness/scripts/verify.mjs` is protected.
  - This does not affect WSL.
- **`session-cleanup-power` 0/2 and pin case D2 (Windows).** Both fail with a plain
  ENOENT for `.git/agent-pipeline/session-authority/catalogue.json`, from `stateRead`
  in `reserveSessionAuthorityMember`. The registry is never initialized on that path.
  First question for WSL: does `session-cleanup-power` pass on Linux? If it also fails
  there, the defect is not Windows-specific, and the reserve path or the power writer
  must handle an uninitialized registry.
- **Bound `descriptorGuard` path (Windows).** It reads the plain-fs session descriptor
  through the registry's strict native read and gets WIN-AUTH-DACL
  (probe `scratch/open-probe.mjs`, Windows checkout only). The candidate route is the
  owner's reader `loadSessionDescriptor` in `worktree-lifecycle.mjs`. Not reached by
  D2.
- **verify-evidence-producer (Windows).** It was 7/33 because `registerRun` never
  registers the git common dir, so the ancestor walk is strict up to the drive root.
  `D:\` grants Authenticated Users Modify by default, which makes this a failure on
  practically every Windows host. Commit `0b06f4092` (ALF-C-VEP-BOUNDARY) exports and
  calls `verifyWindowsRegisterCommon` before `registerVerifyRunRecord`, and adds one
  structural test. It is committed UNVERIFIED: the PO stopped its Windows test run, and
  verification moves here.
  - To do under WSL: run `verify-evidence-producer.test.mjs` (34 tests). The call is a
    no-op on POSIX, so the Linux results must stay unchanged, and the new structural
    case must be green.
  - A native Windows rerun (expected about 31/34, with two symlink EPERM host-class reds)
    belongs to the lean Windows pin set, not to this session.
- **Interruption-receipts adapter tripwire.** Backlog item
  `backlog/items/2026-10-17-interruption-receipts-adapter-tripwire-reaches-a-json-schema.md`.

## Where the Windows evidence lives

- Windows Verify sample and triage:
  [windows-verify-sample-20261017.md](../evidence/windows-verify-sample-20261017.md).
- PO decisions of 2026-10-17: decision log, the sections dated 2026-10-17.
