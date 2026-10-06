# Critic record — GPGL-8t and GPGL-8 fix verification

- Review object (enumerated): `9e1ff54d8` (GPGL-8t, test-only), `7b0bb402a` (GPGL-8, implementation)
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime prompt, effort marker max); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted; all bypasses traced statically, not executed
- Budget: 20 of 24 + 1 closing; notes persistence unavailable (this file is the Elephant's record)
- **Verdict: FAIL**

## Findings

### F1 — major: check #5 can be bypassed with an escaped command terminator or an escaped backtick

In the POSIX and Windows-path readings `scanShell` writes a backslash-escaped structural character into the detection
view as a literal (`git-cmd.mjs:70`, `:231-233`); check #5 then reads it as live syntax: `SIMPLE_COMMAND_END_RE`
(`:487`) cuts at the `;` of an escaped `\;`, and the backtick-parity rule (`:508-510`) counts an escaped backtick.
Traced: `git -c x.y=a\;b $(echo push) origin main` (bash runs a push) is false under all three readings (option collapse
`:299-320` silences check #2; check #5 cuts before the substitution; positional and whole-string branches miss,
`:714-718`). Same with backtick or parameter substitution and with `\|`, `\&`, `\)`; a parity variant with an escaped
backtick before git also escapes. Spec-ref: Proposal "Fail closed"; GPGL-7 F-2; GL-09 (`guardrails/global.md:80`); QG-11.

### F2 — major: other `$` forms still evade check #5, undocumented

`SHELL_EXPANSION_START_RE` (`:484`) covers only `$(`, `${` and the backtick. Bare parameter expansion
(`P=push; git $P origin main`, `git $1 …`, PowerShell `$p`), bash locale quoting `git $"push" origin main` (only `$'`
is special-cased, `:249`), and PowerShell grouping `git ("push") origin main` classify as not-a-push. The commit message
claims parameter substitution is fixed; only the braced fixture is pinned (`git-cmd.test.mjs:677`). Spec-ref: Proposal;
F-2; GL-09; QG-06.

### F3 — major: substitution inside an unquoted here-document body is treated as data

`withoutHeredocBodies` strips every body regardless of delimiter quoting (the view inlines `'EOF'` as `EOF`, `:266`);
the new comment calls bodies "data, never command text" (`:659`), but bash substitutes inside an unquoted-delimiter
body, so a `$(git push origin main)` line in a `cat <<EOF` body runs a push and classifies as false (`:258`, `:688`,
`:697`, `:718`). Pre-existing in the whole-string branch; this diff restates the false premise. Spec-ref: Proposal;
GL-09; QG-09 (`quality-gates.md:111`); QG-06.

### F4 — major: the branches that loosen the new checks have no tests (QG-11)

The command-terminator cut (`:487`), the odd-parity backtick allowance (`:510`), heredoc stripping of check #5's input
(`:697`), the header's claims that `cd $(git rev-parse …)` and a backtick assignment stay out of the gate (`:620-623`),
and the accepted over-approximations are untested in either direction. Spec-ref: QG-11 (`quality-gates.md:125`, `:127`).

### F5 — minor: open-gap notes stale and undated

`git-cmd.mjs:605` says the nested-quote gap has "no backlog item yet" (it has one); `:601-602` asks the dispatcher for
owner and expiry; neither follow-up item carries a due field in its front matter (the due point is only in the Proposal
prose). Spec-ref: QG-06.

## Deliberately not flagged (summary)

GL-B13, echo-wrapped and quoted-executable pins pass; all 22 F-1/F-2 pins pass (195/195); typographic quote classes
match PowerShell's delimiter sets and never cross-close; `literalBackslash` removal safe; check #6 case-insensitive and
limited to double-quote-class spans; scope matches records; test commit additive, fix commit touches no test (QG-04
separation and QG-07 red-first hold); export unchanged; no new dependencies; English; trailers clean. Dropped: the
"stays ASCII" comments contradict raw characters (disclosed, cosmetic); guard-push baseline FAILs unchanged.

## Trajectory — consistent

red/before 173/195 (the 22 pins), after 195/195, guard-push identical FAIL set before/after, gitleaks-prefix exit 0,
consumer-safe-paths 9/9. Not checkable: logs carry no commit/tree/timestamp; no Codex pretool suite evidence.

## Briefing violations

None.
