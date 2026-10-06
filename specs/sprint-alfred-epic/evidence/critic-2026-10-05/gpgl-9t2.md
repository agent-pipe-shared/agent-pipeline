# Critic record — GPGL-9t2 brace-expansion red pins (fix verification of gpgl-9t F-1)

- Review object (enumerated): `e66d77b4d` (GPGL-9t2, test-only, +58/−0, `plugins/pipeline-core/lib/git-cmd.test.mjs`)
- Spec: `guardrails/git.md`, `guardrails/quality-gates.md`; registry: gpgl-9t F-1
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime
  prompt; effort not observed); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted
- Budget: checkpoint at call 20 of 24
- **Verdict: pass/fail withheld — partial review** (not reached: `guardrails/security.md`, an `sh --version` probe,
  the summary line of the Critic's own run). One minor finding.

## Findings

### F1 — minor: the wrapper pins stop at `bash -c`, while the classifier also treats zsh, sh and ssh as wrappers

Only `bash -c 'git {push,origin} main'` is pinned (`git-cmd.test.mjs:832`); the classifier's wrapper regex also covers
`zsh`, `sh`, `dash`, `pwsh`, `cmd`, `ssh` (`git-cmd.mjs:716`). The test comment (`:793`) says POSIX sh does not
brace-expand, but `sh` is bash on Git for Windows and macOS, and zsh does brace-expand. A fix keyed on the wrapper name
could turn every pin green while `zsh -c`, `sh -c` or `ssh host "…"` pushes still classify false. Spec-ref: GIT-04
(`guardrails/git.md:69`); the classifier's fail-closed rule (`git-cmd.mjs:636-641`); test contract `:787`.

## Deliberately not flagged (summary)

All 31 rows checked by hand against bash brace-expansion grammar and the unchanged classifier: every "bash runs:" line is
correct, each red row fails for the reason its label names, the one green row (`push{,}`, line 810) is caught by the
whole-string branch as labelled. Test-only, additions only, every row asserts `out === true`; suite registered
(`verify.mjs:399`); negative side deferred to Q12 and disclosed; trailers clean; English; no dependency.

## Trajectory — consistent

`red.log`: exit 1, 197/263, 31 new rows = 30 FAIL + 1 PASS, 36 GPGL-9 failures pre-existing; the Critic's own run shows
the same FAIL lines (summary truncated). Authorship rests on trailers (record not supplied). Observation: the evidence
logs live only in ignored scratch.

## Briefing violations

None.

## Elephant routing

Test-only follow-up GPGL-9t3: wrapper pins for `zsh -c`, `sh -c` and `ssh host "…"` with brace expansion, and the
`:793` comment corrected.
