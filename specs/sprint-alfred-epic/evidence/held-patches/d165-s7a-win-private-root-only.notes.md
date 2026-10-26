# D165 S7a held patch: Windows private custody judged once at the private-state root

Slice W6-D165-S7A-WINROOTONLY-20261026, base HEAD 0cb0c36bb7e9d7ad3d85a1785ab602dbec7fdc89.
Item: backlog/items/2026-10-26-windows-private-state-check-counts-acls-inherited-from-above-the-repository.md, points 2 to 5 (point 1, the bootstrap finding, is slice S7b and not part of this patch).

## Cause

`evaluateWindowsPrivateState` in `plugins/pipeline-core/lib/windows-private-state.mjs` refused any ACE of a private file that was not the current principal, including ACEs the file inherited from the drive root or a parent folder. `calibrationApprovalFile` in `scripts/pipeline-state.mjs` (~14378) goes through `assessWindowsPrivatePath`, so the approved plan read as unavailable (CVCT-FILE) below a drive root granting Authenticated Users or Users.

## Changes (all in the patch; `scripts/pipeline-state.mjs` is NOT changed: it already calls `assessWindowsPrivatePath(target)`, which now applies the new policy)

`plugins/pipeline-core/lib/windows-private-state.mjs`:
- `parseObservation`: optional `inheritedFlags` (booleans parallel to `principals`); present-but-malformed makes the observation malformed; absent means every ACE counts as not inherited.
- new export `evaluateWindowsPrivateFileUnderRoot(observation, rootVerdict)`: file under a secure root gets no DACL verdict for inherited ACEs; an explicit foreign ACE, owner drift, reparse point, empty DACL still insecure; a non-secure root makes the file insecure (reason names the root path), an unavailable root makes it unavailable.
- new export `assessWindowsPrivateRoot(root, options)`: strict rule (all effective ACEs, inherited included), memoized per process by root path and observation identity (lstat dev:ino:type, or `options.identity`); only secure verdicts are memoized; insecure reasons name the root and carry `rootPath`.
- `assessWindowsPrivatePath`: derives the root (`<git-dir>/agent-pipeline` via the existing regex, else the nearest `.../project` directory) or takes `options.privateRoot`; path equal to the root keeps the strict evaluation; observer seam `options.observe`; a throwing or malformed observer fails closed as unavailable.
- native observers (single-path `OBSERVE_SCRIPT`, batch `OBSERVE_BATCH_SCRIPT`) now report `inheritedFlags` from `IsInherited`; `batchRowShapeOk` accepts the optional sixth key (old five-key rows still accepted).
- `hardenWindowsPrivateDirectory` clears the root memo.
- No call that writes an ACL was added. `assessWindowsPrivatePaths` / `evaluateWindowsPrivatePathBatch` (batch route) still use the strict per-path evaluator, deliberately unchanged.

`plugins/pipeline-core/lib/windows-private-state.test.mjs`: 8 new cases WPS017 to WPS024 (prefix D165-S7A); the pinned count assertion changed 16 to 24 (necessary consequence of adding cases; no existing case touched).

Preimage SHA-256 (at base HEAD):
- plugins/pipeline-core/lib/windows-private-state.mjs: e18be12439a375c1498db5acf44c05b9332618af771b0942f8df4870aaa124ad
- plugins/pipeline-core/lib/windows-private-state.test.mjs: 6dc80573860415e9bb5ea7090dcb62cfa27c4e3322c97c386d44ca4c53e8fef0

## Evidence (clone of HEAD, Linux, node)

- RED: before the production edit, windows-private-state.test.mjs exit 1 (the new D165-S7A cases failed on the missing `observe`/root policy).
- GREEN: windows-private-state.test.mjs exit 0, tests 24, pass 20, fail 0, skipped 4 (the 4 skips are the win32-native-only cases, as before).
- guard-maintenance-window-kernel-closure.test.mjs: exit 0, 11 passed, 0 failed, at HEAD and after.
- scripts/pipeline-state.test.mjs: exit 1 BOTH at HEAD (before any edit) and after, at the same place (`prepareCalibrationArchitectureFixture`, line 59, `'blocked' !== 'ready'`, called from line 2128) in the clone. This red is pre-existing and unrelated; no case in it was reached, so it gives no evidence for or against per-file-verdict expectations. No change to that file was made.
- `git apply --check` of the final patch in a fresh clone of HEAD: exit 0.

## Not done / PO steps

- Native Windows qualification of the observer change (`IsInherited` in the PowerShell scripts, real DACL on a drive whose root grants Authenticated Users) was NOT performed here; it is a PO step.
- Root memo identity is the filesystem object identity: an in-place DACL change of an already-secure root within one process is not re-observed (same property as the existing observation memo).
- Because `lib/windows-private-state.mjs` is a custody-trust path, an independent Critic review is REQUIRED before the operator applies this patch.
- Full Verify, batch Critic and PO acceptance remain pending.

## Proposed commit message

    fix(windows): judge private custody once at the private-state root

    A private file below a secure private-state root is judged without a
    per-file DACL verdict; ACEs inherited from above the root are no longer
    counted. The root is assessed once per process under the strict rule,
    explicit foreign ACEs on a file still refuse it, and the native observer
    reports per-ACE inheritance.

    AI-Assisted: true
    Dispatch: W6-D165-S7A-WINROOTONLY-20261026 (goldfish)

## Operator flow

1. `git apply specs/sprint-alfred-epic/evidence/held-patches/d165-s7a-win-private-root-only.patch`
2. `git add -u`
3. `git commit --no-verify -F <message file>` (kernel paths; the operator flow permits it)
4. stamp
5. install
