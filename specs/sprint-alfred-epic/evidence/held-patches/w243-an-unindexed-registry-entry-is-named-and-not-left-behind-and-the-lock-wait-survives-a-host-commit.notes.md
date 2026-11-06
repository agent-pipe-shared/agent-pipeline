# w243 — an unindexed registry entry is named and not left behind, a retained aside can be read, and the lock wait survives a host commit

Criterion: AC-108 (closest accepted criterion; PRD and Spec unchanged). Candidate base: 61a6dc5d516f26531f7145768be3927eafd7c766 (candidate 19i applied).
Held patch: `w243-…-host-commit.patch` (two source files under `plugins/pipeline-core/lib/` and `plugins/pipeline-core/scripts/`, two new test files, one restated assertion). `apply --check` against the repository: exit 0.

## Found

The Windows root cause of the one observed leftover (pair 30/31) is **not confirmed**: it was not reproduced on Windows, and the failed native operations in both
processes were lock create/remove attempts. What the code shows is every path through which a file can be left under `agent-pipeline/session-authority/` that
`registryClosure` does not index. Each is listed with its disposition.

| # | Path (file:line in the base) | How a file stays behind | Disposition |
|---|---|---|---|
| 1 | `reserveSessionAuthorityMember` (registry l.~697 → `updateMembership` l.623) | The member record is published at a NEW path, then the producer record (and catalogue) publication that indexes it fails (on Windows: a replace refused while a lock-free reader holds the record open, EPERM/EBUSY). The member stays: schema `member`, not indexed → `unknown-registry-entry`. | **Closed.** The reservation catches the failure, checks what the last successfully published producer record indexes (the in-memory row is only replaced after its publication succeeded), and moves the unindexed member into `session-authority-abandoned/<stamp>-<hex>-unindexed-record` (`retainLeftovers`). Case 2, 3, 4. |
| 2 | `refreshCertificates` (l.622) | A target certificate is published at a new generation path, then the producer record that indexes it fails to publish → `unindexed-certificate` and every later refresh trips over the existing path. | **Closed** the same way (`retainUnindexed` over the certificates the operation published). Same code path as 1; no separate case (a certificate needs a registered descriptor target, which the fixture does not build). |
| 3 | `publishOriginal`, Linux branch (l.183–186) | `<path>.tmp-<hex>` is created, then `check('publication-race')`, the write or `renameSync` throws: the temp stays and is read as an unknown record. | **Closed.** The temp is unlinked (retried; retained aside when it cannot be removed). Case 2 asserts no `.tmp-` file is left. |
| 4 | Windows native publish (`nativePublish` l.120; `acquireRegistryLock` l.325 → `nativeLockCreate`) | The helper writes `.authority-<guid>.tmp` beside its target and, per its own source ("Keep an unverified orphan"), keeps it when its cleanup loses. A lost exclusive lock create (the contention in pair 30/31) writes such a temp in the registry ROOT itself; its content is a canonical lock record, so the closure walk refuses it as an unknown entry. | **Closed on the registry side** (the helper script is pinned by hash and untouched): after a failed native publish or lock create the writer removes every `.authority-*.tmp` in that directory whose bytes equal exactly this attempt's bytes (retained aside if it cannot be removed). Case 5 (a fake helper that leaves its temp). This is the most probable cause of the observed leftover; it is an inference from the helper source and the evidence, not a Windows reproduction. |
| 5 | `moveRegistryAside` (l.435) | A rename that fails part-way (EPERM) left some entries moved and some not: a half-moved registry. | **Closed.** The moved entries are put back; entries that cannot be restored are listed in `error.notRestored`. Case 6. |
| 6 | `pruneSettledMembers` (l.632) and its rollback | A rename-back that fails leaves a record under the aside while the producer still indexes it. That fails closed on the missing record (ENOENT/preimage), not as an unknown entry. | **Hardened, not a leftover source.** Forward and rollback moves use the retried `moveFile`. The existing prune fault cases (C19I-W238-8) still pass. |
| 7 | `retireLock` (l.277, swallowed `linkSync`/`unlinkSync` at l.285) | The rollback target of a lock that changed while it was retired is the retained aside directory, which lies outside `ROOT`; a failed `unlinkSync` leaves a copy of the lock there. | **Inspected, unchanged.** Nothing lands in the closure walk; the swallow only affects the forensic copy. |
| 8 | `initializeSessionAuthorityRegistry` fragments (l.688) and its publish of members/producers before the catalogue | Records published before the catalogue stay if the catalogue publish fails. | **Inspected, hardened.** A catalogue-less registry is not walked, and the next initialization moves the fragments aside (existing behaviour); that move now uses the retried `moveFile`. |
| 9 | Boundary exit lock removal (l.359, l.1157) | A failed unlink/native remove leaves `registry.lock` itself. | **Inspected, unchanged.** The lock is the one entry the walk knows by name. |
| 10 | Producer/member records replaced IN PLACE (`saveProducer`, `advanceOwnedSessionAuthorityMember`, `releaseSessionAuthorityMember`) | A producer record replaced and the catalogue publish then failing leaves the producer's bytes ahead of the catalogue's reference. | **Not changed** (see below): this is `reference-preimage-changed`, a different refusal, not an unindexed file. |

## What it changes

Registry (`plugins/pipeline-core/lib/session-authority-registry.mjs`):
- The refusal for an unindexed entry reads `unknown-registry-entry: <path relative to the registry root> (schema <parsed schema | none>)`. The leading words are unchanged (`routine-repair.mjs` classifies by substring). The refusal still fails closed.
- `retainLeftovers`, `discardTemp`, `discardHelperTemps`, `retainUnindexed`: the writer that left a record or temp moves it into an aside outside the walk (retained, never deleted unless it is its own temp); a leftover that cannot be moved is not kept silently: the refusal `unindexed-record-retained: <names>` carries it.
- `moveFile`: rename retried up to 4 times on EPERM/EBUSY/EACCES (25 ms steps); every rename and unlink of the registry's own files goes through the platform seam (`setSessionAuthorityRegistryTestSeam({ rename, unlink })`).
- `moveRegistryAside` rolls back a partial move.
- The lock protocol and the 1.5 s per-acquisition wait are untouched.

Repair script (`plugins/pipeline-core/scripts/session-authority-repair.mjs`):
- New read-only verb `inspect-aside --root <root> --aside <name>`: lists every file of one retained directory under `session-authority-abandoned` with size, mtime, parsed schema and `indexed` (whether the aside's own catalogue → producer → member/release/certificate chain names it); `unindexed` lists the rest; repair-written marker files (`repair.json`, `migration.json`, ...) are marked `marker`. Writes nothing. The Windows aside `20261106101024902-47512958-repair-move-aside` can be read after install with it.
- `wait` rebinds the repository on every iteration; `inspect` rebinds once before it reports (so `release-lock`, `heal`, `take-over` close with a fresh binding as well).

## Checks (in the clone, one suite at a time, private TMPDIR)

- `plugins/pipeline-core/lib/session-authority-registry-leftover.test.mjs` — 6 cases, GREEN (6/6); RED before the production edit (6/6 failed).
- `plugins/pipeline-core/scripts/session-authority-repair-aside.test.mjs` — 4 cases, GREEN (4/4); RED before (4/4 failed).
- `session-authority-registry-fewer-checks.test.mjs` 8/8, `session-authority-repair.test.mjs` 46/46, `windows-node-authority-reads.test.mjs` 10/10, `session-authority-registry-fsync.test.mjs` 12/12, `session-authority-lock-wait.test.mjs` 5/5, `routine-repair.test.mjs` 43/43, `architecture-prospective-companion.test.mjs` 3/3 — GREEN.
- `node --test <this file's .check.test.mjs>` — 2/2.

## New case ids and their files (both files need registration in `harness/verify-suites.json`, which is protected; this dispatch did not edit it)

`plugins/pipeline-core/lib/session-authority-registry-leftover.test.mjs`
- C19J-W243-1 the refusal for an unindexed entry names its registry-relative path and parsed schema
- C19J-W243-2 a member published before a producer publication that fails is moved aside, and the publish temp does not stay behind
- C19J-W243-3 a rename that fails with EPERM once on the aside move is retried and the leftover still leaves the walk
- C19J-W243-4 a leftover that cannot be moved aside is not kept silently: the refusal names it
- C19J-W243-5 a Windows lock create that fails leaves no helper temp in the registry root
- C19J-W243-6 a move-aside that faults part-way puts every moved entry back

`plugins/pipeline-core/scripts/session-authority-repair-aside.test.mjs`
- C19J-W243-7 inspect-aside lists a retained aside with size, mtime, schema and whether its own catalogue indexes each file, and writes nothing
- C19J-W243-8 inspect-aside refuses a missing, unsafe or unknown aside name with a typed code
- C19J-W243-9 a wait whose repository HEAD moves between iterations returns lock-free instead of SAR-WAIT-TIMEOUT
- C19J-W243-10 inspect rebinds once before it reports, so a HEAD that moved while the verb ran is not a changed binding

Restated in place (QG-04, same assertion, now also the entry name): `session-authority-registry-fewer-checks.test.mjs` case C19I-W238-1 — `error.reason === "unknown-registry-entry"` became a match of `unknown-registry-entry: zz-unknown.json (schema none)`. Nothing was weakened or removed.

## Not changed, not proven

- The Windows root cause is **unconfirmed**. Paths 1 and 4 are the two code paths that fit the evidence (an interrupted index update; a kept helper temp after a lost lock create); neither was reproduced on Windows. The helper (`windows-owned-authority-native.ps1`, hash-pinned) was not touched.
- A contender's `.authority-*.tmp` is visible in the registry root for the milliseconds of its lock create. The closure walk of the lock holder can meet it and refuse (or fail to inspect it) while it exists. That transient exposure is NOT closed: tolerating it would weaken `registryClosure`, which the briefing forbids; the writer-side cleanup bounds its lifetime. A retry of the refused operation passes.
- In-place replacements followed by a failed index update (path 10: producer ahead of the catalogue, member replaced ahead of the producer) are not rolled back; they surface as `reference-preimage-changed` and are repaired by heal/move-aside as before.
- New early exit on a failure path: `discardHelperTemps` runs in the catch of `acquireRegistryLock`; if removing the helper temp fails and the retained-aside move also fails (4 retries, about 250 ms), `retainLeftovers` throws `SDC-AUTHORITY-UNAVAILABLE` (`unindexed-record-retained: ...`) out of the lock-wait loop instead of `SDC-LOCK-HELD`. The loop, the lock protocol and the 1.5 s bound are untouched. Own publish temps are removed rather than retained aside (they are not records); they are retained aside only when they cannot be removed.
- A stray that is not canonical JSON still stops earlier, at `invalid-record-json` / `noncanonical-record-json`, without a name.
- Not run in the clone: the whole native-goldfish host state suites; the Windows-only branches ran through the seam on Linux only.
- No Windows run, no `harness/` registration, no Critic review, no PO acceptance.
