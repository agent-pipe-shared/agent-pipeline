# Held patch: Windows session lock release postcondition and dead-owner recovery

- Outcomes: `pipeline.greenfield.r2.windows-lock-release-postcondition`, `pipeline.greenfield.r2.windows-session-lock-owner-recovery` (AC-127; related AC-200, AC-272; findings C2-P1-WIN-FSYNC, C2-P1-WIN-ORPHAN).
- Authored by Goldfish dispatches W2-R2-WINDOWS-SESSION-LOCKS-20261026 and W3-R2-WINDOWS-SESSION-LOCKS-C1-20261026 (goldfish-implementor, sonnet/medium) in an owned scratch work tree. The Coordinator packaged the patch from that tree and re-ran the suite itself.
- Candidate: `864902b94dd05263244dc17b9b5dc776f10a1bc7`.
- Patch: `r2-windows-session-locks.patch`, SHA-256 `3c36c6d249fa8c4f2dae36f2c7676260a6f58cb3cc2ddef7742ffda162dfb5e4`.

## Why a held patch

`lib/session-authority-registry.mjs` is a NEVER_LIFTABLE kernel path. It is applied in the bundled, PO-signed kernel ceremony.

## Preimages at the candidate (SHA-256)

| Path | SHA-256 |
|---|---|
| `plugins/pipeline-core/lib/session-authority-registry.mjs` | `8ca98fcc031efd4784fa0a4930ba0e264c3fe0fe023ae10d40f4cae8898db865` |
| `plugins/pipeline-core/scripts/session-authority-repair.test.mjs` | `01cee5580065c57ec5638034afd0e3c83699e9c72a5ca79b069d30be49746cb2` |

## Checks

- `git apply --check` against the candidate passes for both files.
- RED: the new cases were run against the unmodified registry copy and failed at import level, because `sessionAuthorityLockOwner` was not exported yet. Evidence: `scratch/agent-out/w2-win-locks/red.txt`.
- GREEN, re-run by the Coordinator:
  - `node --test` on the patched work copy of `session-authority-repair.test.mjs` gives 13 tests, 13 pass. Before the patch the suite had 11; SAR12 and SAR13 are new.
  - The Goldfish also ran `session-authority-lock-wait` on the patched copy: 5 of 5 pass.
- Host check: the unmodified repository test file is green (Goldfish evidence `host-check.txt`).

## Change

1. **Release postcondition.** `retireLock` takes injectable `io` (`syncDirectory`, `rename`).
   - A directory fsync that fails after the lock was already moved aside and verified no longer reads as a failure. It is reported as `durability: unsupported` together with the error code.
   - `releaseSessionAuthorityLock` now returns one of three postconditions, each with a typed `nextAction`: `{lock: removed, durability: synced}`, `{lock: removed, durability: unsupported, syncErrorCode}`, or `{lock: retained, durability: not-attempted, errorCode}`.
   - It never claims a rollback.
2. **Windows owner judgement.** The owner record names the Windows process start (`win32-<ticks>`, from `observeWindowsProcessIdentity`).
   - The judge runs only when the lock was taken on the same host.
   - **Dead:** the PID is absent, or the PID is present with a different `win32-` start (the PID was reused).
   - **Live:** the PID is present with the same start.
   - **Unknown:** anything else. This covers a missing or foreign-shaped recorded start, an unavailable observation, an exception, a foreign host, an owner-less lock, and `pid < 1`.
   - The Linux branch is unchanged.

## Safety reasoning

- A live owner can never be released. The existing release refuses a live owner, and the Windows judge returns `live` exactly when the recorded start matches.
- Without a positive proof the lock is not reclaimable. A recorded start that cannot be observed or compared yields `unknown`.
- The move-aside keeps a forensic copy and is not a delete. It still verifies dev, inode and content before it retires anything.

## Pending (named, not done)

- Native Windows qualification. The branches were exercised on Linux through injected seams only.
- Follow-up: `scripts/session-authority-repair.mjs release-lock` still exits 0 on a `retained` result. That script is out of this patch's scope.
- Batch Critic review, the bundled ceremony, Full Verify and PO acceptance.

## Conflicts

No other held patch touches `session-authority-registry.mjs` or `session-authority-repair.test.mjs`.

## Proposed commit message

`fix(pipeline): report the real lock-release postcondition and retire dead Windows lock owners`
