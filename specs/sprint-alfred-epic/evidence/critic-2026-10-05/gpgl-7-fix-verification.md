# Critic record — GPGL-7 fix verification

- Review object (enumerated): `c9b9d0101`
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime prompt); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted; static reading only (`node` outside the admitted grammar)
- Budget: interim hand-back at the 80 % checkpoint (20 of 24); notes persistence unavailable (this file is the Elephant's record)
- **Verdict: withheld — partial review**

## Findings

### F-1 — major: typographic quote delimiters are neither modelled nor stated as a blind spot

PowerShell accepts typographic quotes as string delimiters (double U+201C–U+201E, single U+2018–U+201B). `scanShell`
opens spans only on `$'`, `'` and `"` (`git-cmd.mjs@c9b9d0101:216-218`) and closes a double-quoted span only on U+0022
(`:105`); structural span content is blanked (`:227`). Static trace: an ASCII-opened string closed by a typographic
quote, followed by a `git push` statement and a reopened string, classifies as not-a-push in all three readings, so
`guard-push.mjs:351` takes the fast-path exit and `codex-pretool-guard.mjs:373` never schedules guard-push. The new
coverage statement (diff lines 519–528) does not name this class, and the backtick backlog item does not track it.
Spec-ref: QG-05 (`guardrails/quality-gates.md:79`); spec Description (fail-open in the push classifier; the Codex route
relies on the classifier).

### F-2 — major (predates `c9b9d0101`): shell expansion in command position is not failed closed

`$`, `(`, `{` and the backtick are ordinary word characters (`git-cmd.mjs:232-235`), so `git $(echo push) origin main`,
a backtick-substituted push word and `git ${X:-push} origin main` produce words that miss check #2 (`:440`, `:592`),
`directPush` (`:607-610`) and the whole-string branch (`:613`); a push inside a double-quoted `$(...)` is blanked
(`:227`). Under Bash each runs a real push. GL-B12 does not pin this class (it is refused for its literal `git --redact`
argument, `guard-push-gitleaks-prefix.test.mjs:197`). The rewritten blind-spot statement names only the double-quoted
`$(...)` form, and the backlog item frames it as PowerShell-only. Spec-ref: QG-05, QG-06 (`:87`); spec Description.

### F-3 — minor: tests shipped and corrected inside the implementing work package

`GPGL7_POWERSHELL_PUSH_TABLE` / `GPGL7_NEGATIVE_TABLE` were written by the implementing dispatch, and two cases were
corrected after the RED run in the same commit (one non-push removed, a `--force` case added, never run RED). The
Critic traced the removed case and confirms it is not a push (no weakening; procedural breach). Spec-ref: QG-04
(`guardrails/quality-gates.md:71-72`).

## Deliberately not flagged (summary)

Check #3 intact (`:555-558`); GL-B13, echo-wrapped and quoted-executable shapes still pinned and passing; both F1 shapes
classify as pushes (`green.log:154-163`) and `parsePushBinding` (`guard-push.mjs:407-419`) refuses both, so the
classifier/tokenizer reading mismatch fails closed; OR-composition only adds positives; POSIX and Windows-path readings
and `tokenizeArgv` output unchanged; test diff additive; scope matches `changedFiles`; authorship trailers clean;
backtick escape and here-strings tracked with owner and due point. Candidate only: a possible new false positive in the
PowerShell reading for an odd number of `\"` inside a Bash double-quoted argument.

## Trajectory — not verifiable

Consistent: red 157/166 exit 1, green 166/166 exit 0, gitleaks-prefix 28/28, consumer-safe-paths 9/9. Missing: a
guard-push baseline artifact behind "FAIL set equals the baseline" (the three FAILs PG26a, PG-CHECKPOINT,
PG-CHECKPOINT-WORKTREE are transport/approval-state cases; every classification case passes); no log carries a commit
SHA or timestamp; the `--force` case never ran RED.

## Not reached

`guardrails/global.md`, `guardrails/security.md`, `guardrails/git.md`, `CLAUDE.md` at the commit, `project/pipeline.json`
beyond lines 5 and 9, QG-07, `roles/goldfish.md` GF-04, `.claude/guard-config.json`, `codex-pretool-guard.mjs` beyond
line 373, `guard-push.mjs` beyond 340–429, `docs/adr/0011-language-policy.md`.

## Briefing violations

None.
