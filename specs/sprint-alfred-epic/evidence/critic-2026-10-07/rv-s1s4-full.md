# Critic — RV S1–S4 package, full review (81c288f32, 4f308c304, 6684a3cb9, 18aa336a6, a3399a2d7, f0c1520b5, 05459abb6)

Route claude-opus-5-5 (effort unknown), functional-equivalent-read-only. Partial review (runtime checkpoint at counted
call 20 of 25); pass/fail withheld. Three majors, four minors. Trajectory consistent (RED at import → 6/6, 17/17, 53/53);
test integrity (QG-04) held; trailers GIT-03-clean; no new dependencies.

## Findings (registry IDs)

- RV-F1 (major): `buildLegacyCustodyAuthorization` (`lib/legacy-owner-custody.mjs` ~125-136 @05459abb6) validates only
  `sessionEnded`; `receipt`, `classification`, `casPrecondition` are copied unchecked and `verifyLegacyCustodyProof` has
  no package-shape check, so a package with `receipt: undefined`, raw receipt bytes or no CAS precondition builds,
  signs and verifies. RV-3 (spec 1204-1206); header line 7 ("never bytes").
- RV-F2 (major): `classifyLegacyReceipt` (~40-58 @a3399a2d7) reads with `readFileSync` without size bound, lstat,
  symlink or regular-file check: a symlinked receipt classifies `matching`, a FIFO blocks, an oversized file is read
  whole. RV-2 (1201-1203); §20.2 1158-1159, row 1173.
- RV-F3 (major, spec/ruling conflict): the seven-key package of ruling (16) carries no expiry, no mandatory session or
  target identity and no archive destination; §20.2 (1160-1165) requires the signed transaction to bind "the physical
  repository and target … archive destination where applicable, expiry and CAS precondition". RV-3's list and ruling
  (16) inherited the omission.
- RV-F4 (minor): the 11 `LOC-` codes are not registered in `lib/recovery-refusal-registry.mjs` (TODO without owner),
  and the registry test scans only `worktree-lifecycle.mjs`. QG-06; RV-7 (1219-1221).
- RV-F5 (minor): `WT-ORPHAN-ARCHIVE-READBACK` is registered `refuse` with a null prerequisite although it is raised
  after a write (`worktree-lifecycle.mjs` 1145, 1166) and a retry then fails `TARGET-EXISTS`; a post-write failure
  needs an attended handoff disposition. RV-5 (1212-1215), RV-7.
- RV-F6 (minor): RV-1's second clause (native observer never infers reboot) has no test; waived by comment only
  (`worktree-lifecycle.test.mjs` 1153-1156 @81c288f32). Older cases at 843/1119 not examined. QG-09.
- RV-F7 (minor): the evidence artifacts written by `capture-evidence.mjs` record command, label, exit code and output
  but no commit or tree identity, so they cannot be tied to the enumerated SHAs. Spec 1195.

## Not reached

`project/pipeline.json` risk zones; ADR-0063 placement; SEC rule bodies; `worktree-lifecycle.test.mjs` 843/1119;
`OWNER-OBSERVABLE` producer semantics (`worktree-lifecycle.mjs` ~1040-1057); whether evidence files are committed.

## Dispatcher disposition (2026-10-08)

Ruling 25 (amends ruling 16; the Spec's §20.2 wins over the narrower RV-3 list): the custody package adds
`sessionId` (required, equal to the receipt name stem), `expiresAt` (required ISO-8601 UTC; the verifier refuses an
expired package with `LOC-PROOF-EXPIRED`) and `archiveDestination` (required, repository-relative, iff disposition is
`archive`; `null` otherwise). The builder validates every key's shape and refuses with `LOC-PACKAGE-INVALID`
(receipt exactly `{sha256: 64 lowercase hex, size: non-negative integer}` or exactly `{absent: true}`; repository
exactly `{commit, tree}` 40/64 hex; classification from the RV-2 vocabulary; `casPrecondition` an object with a
non-empty `receiptPath`); the verifier re-checks the shape before the proof. Ruling 26: `classifyLegacyReceipt` lstat-checks
before reading — a symlink, non-regular file or a file above 1 MiB (the bound `applyLegacyCustodyDisposition` already uses, e8f2e0abf) is typed unavailable (`LOC-TARGET-UNSAFE`,
size → `LOC-RECEIPT-OVERSIZE`), never read. RV-F4: register all `LOC-` codes and scan the custody module.
RV-F5: `WT-ORPHAN-ARCHIVE-READBACK` becomes an attended handoff with a named prerequisite. Sequencing: after RV-S5-F
lands (same module), one test-only dispatch RV-S4-T2 pins F1/F2/F3/F4/F5 (fixture builders updated to ruling 25 are
part of that dispatch), then RV-S4-F2; one delta Critic over F1–F7 plus the unreached items, then self-verify.
RV-F6: dispatcher reads the older cases 843/1119 and decides pin vs. documented waiver. RV-F7: backlog item
(capture-evidence records HEAD and tree).
