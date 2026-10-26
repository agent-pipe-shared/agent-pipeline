# Held patch: recover a session-cleanup lock left by a gone writer

Patch: `p0-session-cleanup-lock-recovery.patch` (17583 bytes, SHA-256
`2b6ae80572d81d1d140f8b8618f62996070311a7b39a20e482c5d4d3b4f20ed0`).
Backlog: `backlog/items/2026-10-26-concurrent-hooks-refuse-dispatch-on-registry-lock.md` (P0).
Built by the Elephant under PO exception D159; no Goldfish authored it.

## Cause, measured live on 2026-10-26

Every governed dispatch was refused `SDC-LOCK-HELD: version 2 native host binding failed
before launch` with no reason. A replay of `prepareNativeGoldfishHostState` with the hook's
own session owner printed the hidden stack:

- `acquireManifestLock` (`lib/worktree-lifecycle.mjs`) called with `noReclamation: true` from
  `withSignedDescriptorCustodyManifestLock`, reached through `reserveSessionAuthorityMember`
  inside the registry boundary, refused "preexisting manifest lock cannot be reclaimed by
  custody".
- The lock was `.git/agent-pipeline/session-cleanup/active/claude-<session>.json.lock`,
  written 00:58:49 local by pid 1050499, which no longer existed. That is the launch of the
  identity C4 slice, the last admitted one. The hook process ended between acquiring and
  releasing the lock.
- Custody deliberately never reclaims a lock, so every later launch of that session was
  refused. `heal`, `move-aside` and the registry-lock path never looked at this file.
- The thrown `WorktreeLifecycleError` carries a message but no `reason`, and the native
  prepare catch passed only `error.reason`, so the hook printed no cause.

The live lock was retired once under D159 with the same checks the non-custody path applies
before it reclaims, and kept aside under `session-authority-abandoned`. The next dispatch was
admitted.

## Change

1. `lib/worktree-lifecycle.mjs`: `inspectSessionCleanupManifestLocks` (read-only, owner verdict
   live, dead or untrusted per lock) and `retireDeadSessionCleanupManifestLocks` (moves a dead
   writer's lock aside). "Dead" requires a private regular single-link file, the lock schema,
   its own session id, the owner nonce of that session's descriptor, and a writer whose
   process identity is gone. Custody itself is unchanged and still never reclaims.
2. `scripts/session-authority-repair.mjs`: `inspect` reports `cleanupLocks` and names `heal`
   for a dead one; `heal` retires them before it enters the registry boundary and reports
   `retiredCleanupLocks`; the retired files stay under
   `session-authority-abandoned/<time>-<rand>-session-cleanup-lock/`.
3. `lib/native-goldfish-host-state.mjs`: the prepare catch passes `error.message` when an
   error has no `reason`, so the refusal names its cause.
4. `scripts/session-authority-repair.test.mjs`: case SAR14.

## Evidence

Built and run in a clean clone of `c42dbaf7f` with the earlier C29 patches applied first
(`scratch/agent-out/el-cleanup-lock/stack-build.mjs`, logs in its `evidence/`):

| Suite | Before (case added) | After |
|---|---|---|
| `session-authority-repair.test.mjs` | 14 tests, 13 pass, 1 fail (SAR14: `reason` null) | 14/14 |
| `native-goldfish-host-state*.test.mjs` (3 files) | n/a | 50/50 |

An earlier run in a symlinked work copy was also green (repair 12/12 before the Windows patch
base; host state plus worktree 51/51).

## Preimages (after the C29 base patches, which this patch stacks on)

- `plugins/pipeline-core/lib/worktree-lifecycle.mjs` `4c12403ea45d64be55ea1bb340297dd2d26515448571c21ed580cf151555a150`
- `plugins/pipeline-core/lib/native-goldfish-host-state.mjs` `a13ff8ecdb17fcbcad17bd47a2d99bc71daf010420f4b22d22db8b776e7215f5`
- `plugins/pipeline-core/scripts/session-authority-repair.mjs` `7d45038f0afa2433fb7c39f38847192456d8873f4ee6dfcd75614d0123374dce`
- `plugins/pipeline-core/scripts/session-authority-repair.test.mjs` `dad2f17037a173b17a3380c82fe98ea3c95b5ee5424e3a336dcd719d9125c9be` (after `r2-windows-session-locks.patch`)

## Apply order

Apply after the six C29 patches in `po-ceremonies-pending.md`; it depends on
`r2-windows-session-locks.patch` (same test file, adjacent import line, table end). The full
chain of seven applied cleanly in a fresh clone of `c42dbaf7f`.

## Safety

- A live writer and a lock whose nonce does not match the session descriptor are never
  retired (SAR14 controls). A malformed or foreign-schema lock reads untrusted.
- Nothing is deleted: retired locks are moved aside and retained.
- The retire step runs outside the registry boundary, like the custody design expects, and
  needs no lock.

## Open, not in this patch

- Why the hook process ended inside custody (a hook timeout or kill) is not established.
- `inspect` still counts settled native reservations as in flight (separate acceptance in the
  P0 item).
- Hook refusals elsewhere that print only `error.reason` may hide causes the same way.

Proposed commit message: `fix(session-authority): name and heal a session-cleanup lock left by a gone writer`
