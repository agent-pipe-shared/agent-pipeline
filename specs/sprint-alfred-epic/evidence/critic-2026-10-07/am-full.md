# Critic — AM package, full review (1c04873ab, 842470e8f)

Route claude-opus-5-5 (effort unknown), functional-equivalent-read-only. Complete review (19 of 20). Verdict **FAIL**
(two majors, five minors). Trajectory consistent (13/13 RED at import → 13/13 green). Notes could not be persisted
(no Write tool in the Critic runtime; see toil T61).

## Findings (registry IDs)

- AM-F1 (major): `publishAgySnapshot` reads the pointer once (`lib/agy-central-snapshot.mjs:242`), checks downgrade
  against that read (`:243`), copies (`:245-288`), then moves the pointer with a fresh preimage (`:189`, `:197-199`) and
  prunes from the stale read (`:292-294`); nothing serialises publishers. Two concurrent update verbs can silently
  downgrade the pointer, delete the newer snapshot, or leave the pointer at a deleted directory; same-version
  publishes collide at the rename (`:279`) with an untyped error. Design note `:11`, `:32`, `:44`, `:47`, `:51`, `:64`.
- AM-F2 (major): the suite is not registered in the verify gate (`harness/verify-suites.json`, protected TP-13); the
  design note's stop condition was not raised or tracked. QG-02, QG-06.
- AM-F3 (minor): the git-hook-footprint read primitives were not reused; the module lacks `O_NOFOLLOW`, hardlink
  refusal, fd identity/drift checks and size caps (`:56-62`, `:100`, `:137` vs `git-hook-footprint.mjs:18`). Design §3.
- AM-F4 (minor): AM-7 never exercises `sweepStaleTemps` on a real stale temp — the module's own catch removes the temp
  (`:280-282`), so the assertion at `test:174` passes regardless.
- AM-F5 (minor): the owner file is unlinked (`:277`) before the directory fsyncs (`:278`); a crash there leaks an
  ownerless temp that the sweep keeps forever (`:218-220`); the precedent removes the owner immediately before rename.
- AM-F6 (minor): AM-11's symlink case silently `continue`s on EPERM (`test:238`) instead of a recorded skip.
- AM-F7 (minor): AM-2 does not assert "nothing created" for an unresolved anchor (`test:89-100`).

## Dispatcher disposition (2026-10-08)

Ruling 34: publishing is serialised by an exclusive per-user publish lock under the snapshot root (exclusive create
with owner pid + start time; a stale lock — owner not alive — is reclaimed with the same rule as the temp sweep);
under the lock the pointer is re-read, the downgrade check and the prune keep-set use that locked read, and a
same-version publish converges to the existing digest directory (idempotent, as case 4). A lock held by a live owner
refuses with `AGS-PUBLISH-BUSY`. AM-F3: reuse `readPhysicalFootprint`-equivalent checks (no-follow open, `nlink === 1`,
fd identity, 1 MiB per file / 32 MiB total) — `AGS-SOURCE-UNSAFE` / `AGS-SOURCE-TOO-LARGE`. AM-F5: owner file removed
immediately before the rename, after the fsyncs. AM-F4/F6/F7: test pins (real stale temp with a dead owner pid;
`t.skip` on symlink EPERM; nothing created for an unresolved anchor). AM-F2: suite registration for all new suites of
this wave goes into the tranche-1 `verify-suites.json` post-image at package build time, once each suite is green or
carries typed host skips (tracked in the tranche-1 manifest). Sequencing: after AM-F2 lands, AM-T3 (test-only) then
AM-F3; one delta Critic, then self-verify.
