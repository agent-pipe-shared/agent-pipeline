# Critic report: WIN-GMW (Opus, class G), first round, PARTIAL — 2026-10-09

Persisted verbatim in substance by the Elephant (the Critic has no Write tool). Review object: `4ef3071a6` (whole) and
the `normalizeRepoRelativePath` hunk `@@ -732,14 +735,19 @@` of `e51844ab8`.

- Route: requested `claude-opus-5-5 at max`; effective identity `claude-opus-5-5` (observed in the dispatch's own
  runtime prompt); effort not observed. Route pre-check passed.
- Assurance: functional-equivalent-read-only; no write tool, no mutating command, no delegation. Persistence
  unavailable (no Write tool).
- Budget: 22 base uses spent, 12 returned nothing. Cause (the Critic's own disclosure): it resolved the briefing's
  `evidence/WIN-…` paths against `specs/sprint-alfred-epic/evidence/` instead of the repository-root `evidence/`
  (QG-03); seven Reads hit `GUARD-READ-TARGET-MISSING`. Five shell commands fell outside the grammar (`ls`, multi-file
  `wc`, three multi-file `cat`).

## Findings so far

**F1 (major) — the GS-6 guard fix is carried by an unrelated feature commit under another dispatch's ID.**
- Gap: the class-G hunk (cross-volume rejection, `|| isAbsolute(rel)` at `guard-maintenance-window.mjs:750`, doc comment
  `:738-743`) sits in `e51844ab8`, subject `feat(hardened-private-directory): add the private-root entry point that
  repairs an own insecure segment`. The body never mentions the normaliser, GS-6 or the cross-volume escape; the only
  trailer is `Dispatch: WIN-AP-F2-20261009 (goldfish)`; nothing names WIN-GMW-F-20261009.
- Risk: (1) `git revert e51844ab8` aimed at the private-root feature silently reopens the escape; (2) blame/log on
  `:750` points to WIN-AP-F2 with no WHY; (3) the per-path §6 provenance check cannot see a foreign hunk inside a file
  the committing dispatch legitimately touched (ride-along via an exact-pathspec commit).
- Evidence: `git show e51844ab8` header and trailers; hunk `@@ -732,14 +735,19 @@` next to the kernel-list hunk
  `@@ -189,6 +189,9 @@`.
- Spec-ref: `guardrails/git.md` GIT-02 (`:25-28`), GIT-01 (`:16`); `templates/prompts/agent-obligations.md` §6
  (`:160-163`, `:168-173`); plan `:1989` (class G).

## Deliberately not flagged (summary)

- Spec fidelity: `isAbsolute(rel)` → null restores ADR-0058's GS-6 ("live plugin root minus the kernel"); the kernel
  check still runs first (`:1359`).
- Scope: `4ef3071a6` touches only `guard-maintenance-window.test.mjs`; the hunk touches only the normaliser.
- Reachability: `pathWithinScope` (`:1358`) has one call site (`:1431`); `isNeverLiftableKernelPath` (`:760-769`)
  matches by exact string equality, so absolute forms never matched; namesakes in `check-suite-registration.mjs:143`
  and `codex-critic-host.mjs:373` are unrelated. The change closes the escape and admits nothing new.
- Edge cases (reasoned, not executed, QG-09): other drive, other UNC server, `\\?\` vs plain, drive-relative now null;
  same-server other share and equal target already null. The only new refusal (same file via another root spelling)
  fails closed. No POSIX effect.
- Test integrity (diff only): GMW49 discriminates (`installed === null`, `GMW-CANDIDATE-COMMIT-MISMATCH`, no window
  record); probe-based typed skip `[SINGLE-VOLUME]`; control GMW50 mirrors placement; `repoFixture` default unchanged;
  QG-04 split clean. Coverage note: single-volume win32 hosts skip the pin.
- Trailers: no provider/model/session data (GIT-03). `Commit-Act: orchestrator` on `4ef3071a6` beyond the §6 wording
  was examined and dropped. EL-01: `4ef3071a6` is test-only with an orchestrator commit act.
- QG-06, dependencies (only `node:path`, `node:url`), language: clear.

## Not reached

- `evidence/WIN-GMW-T-20261009/dispatch-record-stripped.json`, `evidence/WIN-GMW-F-20261009/dispatch-record-stripped.json`,
  `evidence/WIN-AP-F2-20261009/dispatch-record-stripped.json`
- `evidence/WIN-GMW-T-20261009/before.txt`, `red.txt`, `wsl.txt`; `evidence/WIN-GMW-F-20261009/native.txt`, `wsl.txt`
- `guardrails/security.md`
- whether the native symptom `signing-ceremony.test.mjs:328` was re-run green after the fix
- whether WIN-AP-F2's record `changedFiles` covers `guard-maintenance-window.mjs`
- the doc comment `:739` "Same normalization as `gateStrengthRuleFor`" (comment staleness or sibling question)

## Trajectory

Not verifiable (records and captures not reached); trailer level consistent with the stated authorship.

## Briefing violations

None (the path resolution error is the Critic's own, disclosed).

## Pass/fail

Withheld — partial review.
