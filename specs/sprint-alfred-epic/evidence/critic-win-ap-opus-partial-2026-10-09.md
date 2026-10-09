# Critic report: WIN-AP chain (Opus, class S), first round, PARTIAL — 2026-10-09

Persisted by the Elephant (the Critic has no Write tool). Review object: `588b84552` (S1), `e51844ab8` (F2/S2, without
the `normalizeRepoRelativePath` hunk), `5428bfecc` (S3), `f79f0bf9f` (T2).

- Route: requested `claude-opus-5-5 at max`; effective `claude-opus-5-5` (the dispatch's runtime prompt); effort not
  observed. Route pre-check passed. Assurance: functional-equivalent-read-only. Notes persistence unavailable; the
  scratch directory `scratch/dispatch/critic-win-ap-a1/` exists and is empty.
- The budget hook enforced 25 (not the briefed 30) and fired the hand-back at counted call 20. Verdict withheld.

## Findings so far

**F1 (major) — the `PB-ROOT-REPAIRED` advisory is published but never consumed.**
- `ensureAgentPipelineRoot` reports a repair only in its return value (`repaired`, `advisory`, `detail`); the only
  production caller, `bindLocalRepositoryFingerprint` (S3), keeps `path` and drops the rest
  (`governance-event-store.mjs:160@5428bfecc`; `hardened-private-directory.mjs:168-169`, returns `:217`, `:244`).
- Risk: the D0 default repair (take ownership and set an owner-only protected DACL on win32; `chmod 0o700` on POSIX)
  runs silently; on win32 it is the normal first-bind input while the unhardened creators remain (pins (b), (c) red
  after S3). The pending PO decision gets no signal when its provisional default fires.
- Spec-ref: execution order `:2029-2030` ("… emitting a typed advisory"); hunt category 3 (published but not consumed).

**F2 (minor) — the POSIX branch accepts a root owned by another user.**
- `ensurePosixRoot` returns early when `(mode & 0o077) === 0` without comparing `info.uid` (`:232`), against the
  JSDoc at `:161` ("A root owned by anyone else … refused under EITHER posture"); the win32 branch refuses a foreign
  owner.
- Risk: a foreign-owned `0o700` root is returned as found; a non-root caller then fails with a raw EACCES, a uid-0 caller
  writes private state into a directory another user controls. Planting needs write access to the git common dir.

**F3 (minor) — `ensurePosixRoot` cannot succeed on a host that does not record POSIX mode bits, and S3 put it on the
event store's first-bind path.**
- A root this call just created with 0o700 fails `isPrivateMode`; the repair route chmods, re-checks and throws
  `PB-ROOT-INSECURE … did not end private after an in-place repair`; the created root is left behind, against the module
  header (`:14-17`). T2 skips the real-host cases for exactly this host class (`hardened-private-directory.test.mjs:339-351`);
  production has no equivalent handling.

**F4 (minor) — S1 pin (e) gives a false RED on some win32 hosts, and S1's skips are untyped.**
- When TEMP passes down no foreign ACE, `makeInsecureSegment` falls back to an explicit `icacls … /grant *S-1-1-0` ACE
  (`agent-pipeline-root-creation.test.mjs:84-97`, `:92`), which the documented repair cannot fix; T2 skips its equivalent
  with a typed `SKIP-HOST-CLASS temp-directory-inherits-no-foreign-ace` (`hardened-private-directory.test.mjs:650`), S1
  pin (e) does not. S1's skips at `:139`, `:156` are not typed.

## Deliberately not flagged (summary)

Spec fidelity of the D0 constant and all S2 branches; win32 ownership test at `:208`; scope (S1, S2 + kernel-list entry,
S3); reachability (entry reached via S3; F1 the only gap); authorship (four `Dispatch:` trailers, no `Commit-Act`, no
co-author/model/session data); test integrity (T2's deletions are import rewrites; hpd 15/15 before/after F2; store
49/2 before/after S3; T2 skips typed; QG-04 split; (b), (c) red by design until S4); edge cases (concurrent first bind
inherited, hypothetical); security (O_NOFOLLOW + dev/inode chmod; path-based observe→harden needs common-dir write
access; harden result re-assessed; anchor-relative messages; fixed PowerShell paths; kernel closure 3 → 0); QG-06; no
new dependencies; English.

## Trajectory

Not verifiable: no evidence head is a reviewed SHA; before/after at different heads on a moving branch; a tree compare
was refused by the guard (`git rev-parse <sha>^{tree}` read as a push with expansion syntax); T2 artifacts carry no
head/tree header; stripped records carry `changedFiles` only. Transitions otherwise match the claims.

## Not reached

`guardrails/security.md`, `guardrails/quality-gates.md`, `guardrails/git.md`, `CLAUDE.md` from disk, the ADR-0063
placement check for the new test file, `governance-event-store.mjs@5428bfecc` beyond the hunk (other creators of
`governance-events`, legacy-binding interaction), `private-boundary.mjs` `assureWindowsPrivateDirectories@e51844ab8`,
evidence-tree vs commit-tree comparison.

## Briefing observations

Stripped records lack DoD/command artifacts; evidence paths were ambiguous until the mechanics correction; budget
mismatch (30 briefed vs 25 enforced); guard refusals: `git rev-parse <sha>^{tree}`, Glob `GUARD-READ-TARGET`, grep with a
repeated `-e`.
