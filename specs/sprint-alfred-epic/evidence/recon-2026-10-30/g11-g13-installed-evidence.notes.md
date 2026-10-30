# G11 and G13 on the installed candidate 11 (2026-10-30)

## G11 a read-only tree rev expression is not a push

- Live, on the installed build `0.7.0+claude.20261030170444.85c269e` with the full hook union of a Claude session:
  `git rev-parse "HEAD^{tree}"` was admitted and printed the tree id. Every PreToolUse hook (guard-push, guard-git,
  lifecycle, read scope) let it through, which answers the open "does guard-git have the same brace problem" check.
- `node --test --test-name-pattern=PG-K153 plugins/pipeline-core/hooks/guard-push.test.mjs` on HEAD `caaa327ee`:
  PG-K153-01..04 (rev-parse, cat-file, ls-tree, rev-list with a quoted braced revision) PASS allow, PG-K153-05..10
  (brace refspecs, an unquoted brace, a chained or substituted push) PASS block. The file's single table test is red
  only for the 22 pre-existing guard-push reds (`backlog/items/2026-10-30-pre-existing-reds-hide-new-cases.md`).
- Fix commit `c80bd9e97` (K153) is an ancestor of the stamp `0cf2cba73`.
