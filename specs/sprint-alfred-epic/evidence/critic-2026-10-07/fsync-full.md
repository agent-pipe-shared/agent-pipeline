# Critic — FSYNC package, full review (326e3a07a, 42a8d765e, 465ed6011)

Route claude-opus-5-5 (effort unknown), functional-equivalent-read-only. Complete review (20 of 24 calls). Verdict
**FAIL** (one major). Scope, test integrity, guardrails, security and language clean; trajectory not verifiable.

## Findings (registry IDs)

- FS-F1 (major): `writeGovernanceActionArtifact` (`lib/governance-action-artifact.mjs:131-149`) has its own
  outcome-reporting handling (catch → `existing-identical` or `GAA-OUTPUT-WRITE`), yet 42a8d765e routed its directory
  fsync through `fsyncDirectoryDurable`; on win32 the tolerated codes now return before the catch and the writer reports
  `{status: "written"}` without a directory fsync, while POSIX still fails. Ruling (18), both clauses. 465ed6011 restored
  only the three `directoryDurability` sites.
- FS-F2 (minor): `lib/fs-durability.mjs` adds four branches (win32 open tolerance, win32 fsync tolerance, non-win32
  pass-through, win32 out-of-set pass-through) with no test; the injectable `{fs, platform}` parameters have no caller.
  QG-11 (`guardrails/quality-gates.md:126-128`).

## Trajectory

Not verifiable: evidence files record no commit or tree (same gap as RV-F7); no run after 465ed6011; no pre-fix red
repro (QG-07). The failures in the evidence (UC02C008/009 before AC34-Fb; GAA04 symlink EPERM on win32) are not
attributable to these hunks.

## Briefing defects noted by the Critic

The briefing attributed "Windows is a first-class platform" to `docs/runner-support.md`, which does not say so; the
ruling was cited from the execution order, which also carries narrative about the same commits.

## Dispatcher disposition (2026-10-08)

Ruling 27 (refines ruling 18; a revert to the inline fsync would re-break the writer on win32, a first-class
platform): `fsyncDirectoryDurable` returns `"confirmed"` after a successful directory fsync and `"unsupported"` when it
tolerates a win32 code; it still throws otherwise. A site that reports an outcome uses the returned value and states
it: `writeGovernanceActionArtifact` adds `directoryDurability` (`"confirmed"` | `"unsupported"`) to its `written`
result, so "written" carries its durability on every platform. The four propagating sites without own handling
(`git-hook-footprint.mjs:38`, `onboarding-consent-marker.mjs:89/224/235`) stay on the helper (confirms the Critic's
reading of ruling 18). Sequencing: FSYNC-T4 (test-only: new `lib/fs-durability.test.mjs` for the four branches and the
return values, plus a governance-writer pin for `directoryDurability`), then FSYNC-F4; one delta Critic only if the
fix touches more than those two production files, otherwise self-verify. Evidence identity gap → backlog item with
RV-F7.
