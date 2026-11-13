fix(dispatch): admit framework route paths and pass every such path to git literally

K-32 (Glossover Epic 2): the host recovery committed
src/app/(payload)/cms-api/[...slug]/route.ts and then refused to write
the dispatch record (GHCR-RECORD-FAILED, "not a literal
repository-relative path"). Briefing, probe, plan and host commit
admitted the path; the record rule did not.

- The record path rule admits [ ] ( ); * ? { } $ and a backtick stay
  refused, and a leading ":" is refused (git pathspec magic). The
  Critic strip admits the same characters as path text.
- Every git call that takes such a path runs with --literal-pathspecs:
  the recover command (intent-to-add, commit, reset), the AGY host
  stage and staged-blob read, and the Goldfish commit steps when a path
  holds a bracket. A glob reading of [...slug] would also match a
  sibling folder such as s/.
- guard-push proves `git [--literal-pathspecs] add|commit` with the
  marker characters inside quotes a plain add or commit; an unquoted
  marker, another global flag and a chained push stay refused.

Tests: a real recover apply commits exactly the bracket path and
leaves the glob-matching sibling untracked; record rule, commit flow
(guard parse of both steps), guard-push PG-K32-01..07, AGY host commit
execution (a spawn mock now finds the subcommand by name).

AI-Assisted: true
Dispatch: stage-0 (elephant)
