# Critic record — Q12 push classifier, delta 1

- Route: requested claude-opus-5-5 at max; effective identity claude-opus-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted. Notes persistence unavailable (Write tool disabled); the report is the record.
- Review object: b5b4a3514, db913f836, 49d6f928d, 5e94c2ae9, bf78508d0, f59568c9e, e694f8509, 31653d2e9, 2baddd831 (base d9b4bf031).
- Verdict: **FAIL** (two major). Trajectory: inconsistent (F-D).
- F-A major (registry F3 class): a heredoc piped into a shell across a line break is still missed when a comment follows the trailing pipe (`cat <<EOF | # c` ⏎ `git push origin main` ⏎ `EOF` ⏎ `sh`) or a comment line precedes the receiver; `TRAILING_PIPE_RE` / `PIPE_LINE_CONTINUATION_RE` admit only blanks (49d6f928d). The AF runner path shares the fold (not measured).
- F-B major (registry F1/F2 class): a quote character inside an earlier comment or data-heredoc body (`don't`, `x"`) hides a later quoted/brace git word (`g"i"t $(echo push) origin main`, `{g"i"t,push} origin main`); `scanShell` has no comment handling and treats heredoc bodies as quotable text.
- F-C minor: Q12-F6 (fix dispatch) added the three lookalike negative rows itself, under the 31653d2e9 test-only block comment — QG-04. Cause: the Elephant's briefing asked for it.
- F-D minor: the Q12-F6 dispatch record lists no commit for `2baddd831`.
- F-E minor: e694f8509 names vi/vim `-es` and `busybox` applets as not modelled without owner, due date or backlog item (QG-06).
- Registry: F1, F2, F3 pinned forms resolved, class not resolved; F4 resolved; F5 resolved for the AF list.
- Disposition: Q12-T9 (test-only, independent) pins F-A and F-B forms incl. the AF runner path and re-pins the three lookalike negatives from a test-only dispatch (F-C); Q12-F7 fixes; delta 2 on that fix. F-D: record lane (decision K); the briefing rule "a fix dispatch never adds test rows" is added to the Elephant rulings (14). F-E: backlog item filed (owner pipeline, due 2026-10-20).
