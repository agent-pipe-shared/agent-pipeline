---
schema: pipeline.backlog-item.v1
id: pipeline.gg22-normalization-false-blocks-trailing-slash-pathspec
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
done_when: manual
tracking: "Nova B -- T1 Critic closing round for NVA-B-GG22FIX-2 (F2, minor): normalizePathspecLexically() drops empty path segments, so a trailing-slash directory pathspec token (backlog/items/) normalizes to backlog/items, which then fails the backlog/items/ prefix check and is classed disallowed -- a legitimate git commit -F <msg> -- backlog/items/ is now blocked while GG-22 debt is outstanding. Fail-closed direction (a false block, not a false admission), so this is NOT a security regression, but it does regress the deadlock fix's own intent for the directory form of a pathspec."
source: "T1 Critic review (opus, max), closing round 2 for NVA-B-GG22FIX-2, finding F2."
---

# GG-22's pathspec normalization false-blocks a trailing-slash directory pathspec

## The gap

`normalizePathspecLexically()` (`plugins/pipeline-core/hooks/guard-git.mjs`,
added by `NVA-B-GG22FIX-2`, commit `c6ef3425`) drops empty path segments
during its `.`/`..` collapse, so `backlog/items/` (trailing slash) becomes
`backlog/items` (no trailing slash). The disallowed-path filter then checks
`!path.startsWith("backlog/items/")` — with the trailing slash stripped,
this now FAILS, and the token is classed disallowed even though it plainly
names a path under `backlog/items/`.

## Confirmed live

`git commit -F <msg> -- backlog/items/` (a bare directory pathspec, no
specific file named) is refused by GG-22 while status-flip debt is
outstanding — the same debt state whose remediation message tells the
agent to commit exactly its pending `backlog/items/*.md` edits.

## Why this is not a security issue, and not urgent

Fail-closed direction only: the token that used to be admitted is now
refused, never the reverse. `NVA-B-GG22FIX-2`'s own actual security fix
(F1, the `-i`/`--include` admission-widening bug) is unaffected. Before
this normalization existed, a bare `backlog/items` (no trailing slash) was
ALREADY blocked by the same prefix check — this only makes the two forms
consistently blocked instead of inconsistently blocked, which is why
severity is minor rather than major.

## Acceptance criteria

- A pathspec token that names a directory (with or without a trailing
  slash) under an allowed prefix (`backlog/items/`, or exactly a
  `LEDGER_PATHS` entry) is admitted, matching pre-`NVA-B-GG22FIX-2`
  behavior for the exact-match case and improving on it for the
  trailing-slash case.
- A regression test covers both the bare-directory and trailing-slash
  forms.
- The `../`-traversal fix (F3 of the prior round) is not weakened by this
  correction — a token that lexically resolves OUTSIDE `backlog/` must
  still be refused.
