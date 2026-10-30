# Settled-pending-aside keys siblings by the content digest (W7, Elephant)

Held patch `w7-settled-pending-keys-siblings-by-content-digest.patch`, built in a scratch clone at candidate 8640c4baf. The PO applies it.

## Finding (live, after the install of candidate 7)

The first real `routine-repair run heal` on this repository retired no pending state: every one was kept with "the sha256 of the bytes
differs from the digest in the name". The digest in a host pending name is a key, not the sha256 of the bytes; the authority-terminal and
authority-integration siblings are named by the sha256 of the pending bytes (`pendingSha256`, `native-goldfish-host-state.mjs` lines 352
and 443). The fixtures of `w7-settled-pending-aside` named a pending file by its own byte digest, so the suite could not see it.

## Behaviour

- `planSettledPending` no longer compares the name digest with the byte digest; it computes the sha256 of the pending bytes and moves the
  siblings of that digest. The settled rule (inspect's reservation row), the symlink refusals and the kept list are unchanged.
- Test fixture now names a pending file by a key digest, as the host does; the old "bytes no longer match its name" case is replaced by a
  case proving a sibling named by the key digest stays and the content-digest sibling moves.

## Evidence (scratch/agent-out/w7pendfix, driver.mjs)

- Clone (patched): routine-repair.test.mjs 25/25; dispatch-briefing.test.mjs 116/116.
- Revert proof (production file at candidate, new tests kept): 3 failing (the settled-pending move case, the new sibling case, the heal case);
  production restored byte-equal.
- Read-only probe against this repository with the patched module (`readSettledPendingPreview`): 241 settled pending states would be
  retired and the stop-failure records of 156 dispatches would leave.
- Patch: 2 files, 20 insertions, 14 deletions; `git apply --check` on the plain candidate exit 0.
- Not run: Full Verify, Critic, Windows.
