# Critic — AM delta (c503adf8a, 32e327d9f, 298c23f96, a29a3e92b; previous reviewed 842470e8f)

Route claude-opus-5-5 (effort max per runtime prompt), functional-equivalent-read-only. PARTIAL (checkpoint; pass/fail
withheld). A first re-dispatch stopped on a wrong spec path (toil T62). Trajectory not verifiable (no candidate binding
in `am-f3.txt`; no RED artifacts for AM-T2/AM-T3; no records for AM-F2/AM-T2 supplied).

## Registry dispositions

AM-F1 resolved (lock at `lib/agy-central-snapshot.mjs:337`, locked read `:341`, downgrade checks `:345`/`:405`, keep-set
`:408-410`, convergence `:381-390`, release in `finally` `:414`; residual AM-D3). AM-F3 resolved inside
`readSourceInventory` (`:57-85`). AM-F4, AM-F5, AM-F6, AM-F7 resolved.

## Findings

- AM-D1 (major): the wiring has no callers — `installAgyFromCentralSnapshot`, `applyAgyCentralSnapshotAfterUpdate`
  (`lib/agy-central-refresh.mjs:4` "callers … are wired in a later slice") and `observeAgyStartHint` are called by no
  installer source kind, update verb or preflight. Ruling 33 B1; design note §3/§4; QG-06.
- AM-D2 (minor): workspace retirement (`agy-central-refresh.mjs:28-33`) runs before the host refresh check (`:39-48`); no
  test reaches the wrapper's own retirement or `refused` branch. Ruling 33 B5; QG-11.
- AM-D3 (minor): stale-lock reclaim park-and-restore (`agy-central-snapshot.mjs:299-308`) leaves the lock path empty
  between rename and link; a third publisher can acquire in that window. Ruling 34.
- AM-D4 (minor): an unreadable lock is treated as live with no age check (`:290`), contradicting the comment at `:268-269`;
  `AGS-PUBLISH-BUSY` then names no lock path or pid. QG-09, ruling 34.
- AM-D5 (minor): new branches in a29a3e92b untested (fd identity / ELOOP / EMLINK `:61-67`, in-read drift `:68`, `:77`,
  `:80-81`, uncertain-ownership aging `:295`, reclaim yield `:304-305`, rename-failure convergence `:390`). QG-11.

Not reached: source reads outside the inventory; whether `fsyncDirectoryDurable`'s returned outcome (ec96b8a3e) is
ignored at `:377`/`:397`; `ATR-UNAVAILABLE` as an existing host code; sweep/lock rule identity.

## Dispatcher disposition (2026-10-08)

Ruling 50: AM-D1 is a wiring slice (AM-W: installer source kind `central-snapshot` in `install-agy.mjs`, the update verb
in `scripts/pipeline-update-channel.mjs`, the start hint in `scripts/pipeline-start-preflight.mjs`; pins first). AM-D2:
retirement moves after a successful host check (nothing mutated on refusal). AM-D3: reclaim uses an exclusive
reclaim marker (`publish.lock.reclaim`, exclusive create) so only one reclaimer acts, and never parks a lock it did not
read as stale. AM-D4: an unreadable lock follows the same age rule as an unknown-shape lock, and `AGS-PUBLISH-BUSY`
carries the lock path (repository-relative to the snapshot root) and the owner pid when known. AM-D5 and the
`fsyncDirectoryDurable` outcome check are pinned in AM-T4. This was the package's delta round: self-verify after the
fixes.
