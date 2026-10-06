# Critic record — GPGL-9t push-classifier red pins

- Review object (enumerated): `1f4f72da1` (GPGL-9t, test-only, `plugins/pipeline-core/lib/git-cmd.test.mjs`)
- Spec: `guardrails/git.md`, `guardrails/quality-gates.md`; registry: gpgl-8 F1, F2, F3
- Route: requested `claude-opus-5-5` at max; effective `claude-opus-5-5` (observed in the dispatch's own runtime
  prompt); route pre-check passed
- Lane: functional-equivalent-read-only; OS isolation not asserted; shapes traced statically (a read-only node probe was
  refused by a guard)
- Budget: checkpoint at call 20 of 24 with the review complete
- **Verdict: FAIL** — one major finding

## Findings

### F-1 — major: no pin for bash brace expansion, a shape inside the table's own F2 class

The table's F2 class (`git-cmd.test.mjs:730-732`: only `$(`, `${` and the backtick count as expansion syntax) pins bare
`$NAME`, PowerShell variables, `$"…"` and grouping, but not unquoted brace expansion: bash turns `git {push,origin} main`
into `git push origin main`. Traced statically, `commandIsGitPush` returns false for it — `{` is a word character to the
scanner (`git-cmd.mjs:271-273`, `:617`), `SHELL_EXPANSION_START_RE` counts only `$(`, `${` and the backtick (`:484`), both
push branches need the literal word `push` (`:714-718`), checks #1/#3/#4/#6 need quotes — and a false result means
guard-push never runs (`:551-556`). Under QG-04 the later fix implementor may not extend the table, so a fix turning it
green could leave this bypass open. Spec-ref: test contract lines 718-720 and 730-732; GIT-04, GIT-05; QG-04.

## Deliberately not flagged (summary)

Each of the 36 red cases fails for the shape it names (F1(a) full 4×3 cross-product, F1(b) parity cases with the third
already caught at line 748, F2(c)-(f), F3 unquoted here-doc bodies); one file, classifier unchanged; the suite is
registered (`verify.mjs:399`), so the red state gates Verify (QG-06 satisfied as a blocking red with reason Q12);
no existing case changed; escaped newline is a line continuation, not an F1 gap; trailers clean; English.

## Trajectory — consistent

37 cases; the Critic's run gave 196/232, exit 1; 36 new failing plus one already caught implies all 195 pre-existing
pass. Not verifiable: the consumer-safe-paths 9/9 claim (no artifact) and the dispatch-record binding.

## Elephant note for PO question Q12

Option (B) as written lists `$`, backtick, backslash, `<<`, parentheses and non-ASCII quotes as push-candidate markers;
brace expansion uses none of them. Whichever option the PO picks, `{` (or brace expansion as a class) must join the
marker set. Follow-up: a test-only dispatch pins the brace-expansion shapes (GPGL-9t2) before any classifier fix.

## Briefing violations

None.
