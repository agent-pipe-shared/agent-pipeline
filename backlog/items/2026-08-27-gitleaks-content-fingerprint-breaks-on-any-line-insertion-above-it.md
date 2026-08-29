---
schema: pipeline.backlog-item.v1
id: pipeline.gitleaks-content-fingerprint-breaks-on-any-line-insertion-above-it
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Hit twice in one session during the Phoenix merge, 2026-08-27"
done_when: path-exists plugins/pipeline-core/scripts/gitleaks-repair-ignore.mjs
---

# A gitleaks content fingerprint goes inert when anything is inserted above the line it covers

## Description

`.gitleaksignore` entries use `pipeline.gitleaks-content-fingerprint.v1`, a
digest over `path \0 rule \0 line \0 column \0 secret`. Because the LINE NUMBER
is inside the digest, the entry stops matching whenever the covered line moves
— even though the file, the rule, the column and the secret text are all
unchanged and the finding is the same false positive it always was.

This was hit twice in one session on the same entry:

1. The merge moved `gitleaks.test.mjs` from `harness/scripts/` to
   `plugins/pipeline-core/scripts/`. An earlier fix updated the entry's
   readable path segment but not the digest — the entry went inert and the
   scan blocked.
2. A later rework added 46 lines to that same test file. The covered line moved
   from 206 to 252, the digest stopped matching again, and the scan blocked
   again on the identical non-secret.

Both times the fix was mechanical: recompute the digest with the repository's
own `gitleaksContentAuthorityLine()` and replace the entry. Both times it cost
a verify round to notice.

## The tension worth naming

The line-binding is not an accident, and the fingerprint should not simply drop
it: a digest that ignores position would keep suppressing a rule at a location
that no longer holds what was reviewed, which is the failure mode a path-only
ignore has. Going inert is the SAFE direction — the scan blocks rather than
silently covering the wrong thing.

The cost is that an entirely routine edit above a suppressed line breaks a
legitimate suppression, and nothing warns the editor. Anyone adding tests to a
file that carries a suppression will hit this.

## What could close it

Not yet decided; options seen so far, none of them free:

- A diagnostic on the blocked scan that says "an entry exists for this
  file/rule/column but at a different line" — turns a mystery into a one-line
  fix, without weakening the binding.
- A helper subcommand that recomputes a stale entry in place (the manual
  procedure already exists as a scratch script and works).
- Binding to surrounding content rather than the line index, so a pure
  insertion above does not invalidate it.

## Triage

- **Decision:** open, unassigned. Not blocking — the workaround is known and
  mechanical — but it will recur for anyone who edits a file carrying a
  suppression, and the failure presents as an unexplained blocking secret scan.
