# Critic — RV-4 full review (26b3c8728, e8f2e0abf) and RV-F1..F5 delta (2242b5ce7, 02aa75cd4, 56234d70c)

Route claude-opus-5-5 (effort not observed), functional-equivalent-read-only. PARTIAL (budget checkpoint at call 16;
pass/fail withheld). Not reached: `guardrails/security.md`, `guardrails/quality-gates.md`, ADR-0063 full text, caller
enumeration of `applyLegacyCustodyDisposition`. Trajectory consistent for every checkable claim.

## Registry dispositions

- RV-F1 resolved (per-key shape checks in builder and verifier; order shape → proof → iff rule → expiry).
- RV-F2 resolved (bounded `readReceiptBytes`: lstat, regular file, 1 MiB, O_NOFOLLOW, fstat).
- RV-F3 partly resolved: expiry and `sessionId` binding enforced; the archive destination is not bound (RV-D1).
- RV-F4 resolved for registration and the scan (16 LOC- codes; scan guard `found.length >= 11`); texts wrong (RV-D2).
- RV-F5 resolved (`WT-ORPHAN-ARCHIVE-READBACK` is a handoff with a prerequisite, pinned).

## Findings

- RV-D1 (major): the signed `archiveDestination` is never enforced. `applyLegacyCustodyDisposition({ …, archiveRoot })`
  (`legacy-owner-custody.mjs:650`, `:707`) passes the caller's `archiveRoot` to `archiveReceipt`, which publishes and
  audits under it (`:594-599`, `:632`) and then unlinks the original (`:636`); `archiveDestination` is read only by the
  shape check and the iff rule (`:292`, `:297-298`, `:325`, `:376`). Spec 1161-1165, 1182-1185, RV-4 1209-1210, ruling 25.
- RV-D2 (minor): registry recovery texts contradict the disposition matrix — the conflict codes (`LOC-STATUS-MISMATCH`,
  `LOC-SCHEMA-MISMATCH`, `LOC-DIGEST-MISMATCH`, `LOC-COMPARE-FLAG-FALSE`) advise "preserve or archive" (preserve is
  forbidden for a conflict) and `LOC-REPLAY-PRECONDITION` advises "preserve or archive" for a matching receipt (archive
  is forbidden); the code refuses both with `LOC-PROOF-INVALID` (`:435-440`). Spec 1167-1171, RV-7 1219-1221.
- RV-D3 (minor): after `publishExclusiveCopy` and `mutated = true`, a changed original returns
  `LOC-PROOF-BINDING-MISMATCH` (`:619`), registered as a dead-end `refuse` — a refusal after a write leaves an archived
  copy with no audit line and no handoff. RV-7 1219-1221; same class as RV-F5.
- RV-D4 (minor): no apply-level case observes `LOC-TARGET-UNSAFE` with zero mutation on the evidence host — the only one
  (symlink, `legacy-owner-custody-archive.test.mjs:556-581`) skips on win32; a portable substitute (a directory named
  `<sessionId>.json`) exists in 2242b5ce7 for the classifier only. RV-4 1210-1211.

## Deliberately not flagged (abridged)

Comment drift `:214-220`; verifier accepting a signed `sessionEnded: false` (builder and apply refuse; ruling 32);
schema id kept at v1; no repository binding at apply (RV-5/S6); win32 lstat/open race and temp/audit races (RV-5);
56234d70c row repair (not a weakening); scope, SEC-04, ADR-0011, QG-06, authorship trailers clean.

## Dispatcher disposition (2026-10-08)

Ruling 44: (a) RV-D1 — the archive root is derived from the signed `archiveDestination`, resolved against the
repository root; a destination that resolves outside the repository root is refused `LOC-PACKAGE-INVALID` at the
shape check, and a caller-supplied `archiveRoot` that differs from the resolved signed destination is refused
`LOC-PROOF-BINDING-MISMATCH` before any write. (b) RV-D2 — each registered recovery text names only the disposition
the matrix admits for that classification (conflict → archive; matching → preserve). (c) RV-D3 — a binding mismatch
detected after the exclusive publish returns the new code `LOC-ARCHIVE-ORPHANED-COPY` (mutated true), registered as a
`handoff` whose prerequisite names an attended review of the copy at its archive path; the pre-write
`LOC-PROOF-BINDING-MISMATCH` stays a dead-end refusal. (d) RV-D4 — a portable apply-level case (receipt path is a
directory) pins `LOC-TARGET-UNSAFE` with zero mutation. Pins first (RV-S5-T2), then the fix (RV-S5-F2); this was the
package's delta round, so the dispatcher self-verifies after the fix. The not-reached guardrail reads are covered by
the dispatcher's self-verify against `guardrails/security.md` and `guardrails/quality-gates.md`.
