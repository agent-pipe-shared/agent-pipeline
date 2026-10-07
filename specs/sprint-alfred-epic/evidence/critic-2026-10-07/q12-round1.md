# Critic record — Q12 push classifier (decisions J, S, X), round 1 (full)

- Route: requested claude-opus-5-5 at max; effective identity claude-opus-5-5 (observed); lane functional-equivalent-read-only, OS isolation not asserted.
- Review object: 33014fba9, a2857ac3a, ac8d773db, d9b4bf031.
- Verdict: **FAIL** (four major). Trajectory: consistent with residues.
- F1 major (regression of `d9b4bf031`): a git word spelled with quote characters plus an expansion (`g"i"t $(echo push) origin main`, backtick and `${X:-push}` forms, `g''it …`) is no longer a candidate — `hasGitWord` tests the raw text, removed check #5 tested the dequoted view (`git-cmd.mjs` ~614-621).
- F2 major (row S): brace expansion whose alternative contains quoting or a backslash (`{g"i"t,push}`, `{g''it,push}`, `{"g"it,push}`, `{g\it,push}`) is not a git word.
- F3 major (row X): a heredoc piped into a shell across a line break (`cat <<EOF |` ⏎ body ⏎ `EOF` ⏎ `sh`) is not a shell receiver — units are cut at every newline (~652, ~684).
- F4 major (row X): a shell receiver named by a quoted path containing whitespace (`"/c/Program Files/git/bin/bash" <<EOF`) is not recognised (quoted span blanked in the view, ~75, ~249, ~672).
- F5 minor (QG-06): the header documents heredocs fed to `xargs`, `at`, `ed`, `sqlite3`, `php`, `lua`, `awk -f -` as data without owner/expiry (`xargs git <<EOF` ⏎ `push origin main` is a push path) → backlog item `2026-10-07-heredoc-fed-to-non-shell-command-runners-is-data-to-the-push-classifier.md` (owner pipeline, due 2026-10-20).
- Incident (disclosed by the Critic): a probe control `"/usr/bin/env" <<EOF` printed the Critic process environment (including a messaging token and session ids) into its own tool output; values not reproduced in notes or report. Surfaced to the PO (rotation is the PO's call); toil T46.
- Disposition: test-only dispatch Q12-T4 pins F1–F4 (with bash-semantics comments), then fix Q12-F4; one delta Critic remains (decision A) on the fix range.
