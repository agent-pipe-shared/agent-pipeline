# Critic report: WIN-GMW delta (Opus, class G), remainder round — 2026-10-09

Persisted by the Elephant (the Critic has no Write tool). Review object: `4ef3071a6` (whole) and the
`normalizeRepoRelativePath` hunk of `e51844ab8`. Scope of this round: Phase A categories 4 (trajectory incl. authorship)
and 8 (security surface). Neutral registry: F1.

- Route: requested `claude-opus-5-5 at max`; effective `claude-opus-5-5` (the dispatch's own runtime prompt); effort not
  observed. Assurance: functional-equivalent-read-only; persistence unavailable (no Write tool). Budget 18 of 22.
- Auto-injected context named and not used as evidence.

## Verdict (scope of this round)

**FAIL**, on one major authorship finding (F-A). Category 8 has no finding.

## F-A (major) — the GS-6 fix exists only in a commit bound to another work package

- Gap: the `|| isAbsolute(rel)` guard (`guard-maintenance-window.mjs:750`) and its doc comment exist only in `e51844ab8`
  (`feat(hardened-private-directory): …`, trailer `Dispatch: WIN-AP-F2-20261009 (goldfish)`, no `Commit-Act`). The body
  never mentions the normaliser. WIN-GMW-F's record: `commits: []`, `changedFiles` includes the file; WIN-AP-F2's record
  claims the commit and the same file. WIN-GMW-F's evidence (native at `625ddd1f1` 05:49:50, WSL at `c7aa93102`
  05:50:27, both dirty) predates the commit (05:53:18): the fix sat uncommitted in the shared tree and a concurrent
  dispatch committed it under its own trailer. No evidence of orchestrator authorship (not the EL-01 case).
- Risk: revert coupling on a fail-open guard fix; wrong provenance (a trailer audit cannot connect the change to its
  dispatch, evidence or review); no WHY in history.
- Spec-ref: `guardrails/git.md` GIT-02, GIT-03, GIT-01; `guardrails/quality-gates.md` QG-07; plan `:2002`; contributing
  cause GIT-05 verification (parallel dispatch ungated only while files do not conflict).
- Registry mapping: the Critic could not tell whether this duplicates F1 (the registry carries no content).

## Deliberately not flagged

- Category 8, the hunk: changes output only where win32 `relative()` returns an absolute target across roots (other
  drive, UNC vs drive, `\\?\`, rooted path without drive onto another drive); no effect on POSIX; no over-refusal on
  one volume expected (reasoned; GMW50 covers the same-volume in-scope path).
- Category 8, callers: `:761`, `:765` (`isNeverLiftableKernelPath`, exact equality against relative entries, so output
  unchanged for every input — no fail-open on the deny side); `:1360` (`pathWithinScope`, not exported, only caller the
  install-tolerance loop `:1431`; now false for a cross-root path, then TP matching on the git-diff path refuses —
  fail-closed).
- `4ef3071a6` authorship: `Dispatch: WIN-GMW-T` + `Commit-Act: orchestrator`, record `changedFiles` = the one test file;
  an orchestrator commit act on a test-only diff, not an orchestrator-authored production diff.
- No provider/model/session trailers. QG-04 separation holds (test 05:44:43 before fix 05:53:18; the fix commit does not
  touch the test).
- Red/green: native red at `b6d29f471` for the right reason (install returned `active`); native green at `625ddd1f1`;
  WSL typed `SKIP [SINGLE-VOLUME]`; GMW50 passes everywhere; failure locations in `red.txt` match the committed pin lines.
- WIN-GMW-T plan criteria met (ceremony-independent, cross-volume fixture, probe-based skip via `path.parse().root`).
- GMW48 native red pre-exists both commits (`before.txt` at `f43bc8564`).
- Noticed outside scope, not judged: `e51844ab8` adds `lib/hardened-private-directory.mjs` to
  `NEVER_LIFTABLE_KERNEL_PATHS`; ADR-0058's 2026-08-10 correction makes such an addition a dated ADR correction, and the
  ADR has none naming that module.

## Trajectory

Inconsistent on authorship (F-A). Consistent on the direction of the test evidence. Not verifiable: which exact
production bytes produced the native green (five artifacts, five heads, all dirty, none a reviewed commit); no
candidate-bound verify receipt; the only GMW49-exercising run exits 1 overall because of the pre-existing GMW48.

## Not read

`guardrails/security.md`, `CLAUDE.md` (budget checkpoint); the hook files calling `isNeverLiftableKernelPath`.

## Environment observations

- guard-push refused a read-only `git -C <path> log … --format="…%(trailers:only,…)"` as "push target is not
  unambiguous" (Ruling 81 marker class).
- The budget hook told a Critic without a Write tool to write interim notes.
