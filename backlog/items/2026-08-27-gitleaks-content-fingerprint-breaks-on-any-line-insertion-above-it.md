---
schema: pipeline.backlog-item.v1
id: pipeline.gitleaks-content-fingerprint-breaks-on-any-line-insertion-above-it
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-01
closure_commit: bd089964c8a5789860984ab75d93f3bcd17152ae
closure_repository: "self"
closure_evidence: plugins/pipeline-core/scripts/security-adapters/gitleaks.test.mjs
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

## Closed, 2026-09-01 (NVA-B-STALECLOSE)

Per this briefing's AC-4, judged on the code, not the `path-exists` predicate
(a file merely existing proves nothing about the defect). Re-verified both
halves of AC-1: (1) read this item's own text — "What could close it" names
three non-exclusive options, none mandatory together; (2) `git log --oneline
-1 -- plugins/pipeline-core/scripts/gitleaks-repair-ignore.mjs` resolves to
commit `bd089964` ("fix(security): diagnose stale .gitleaksignore line-bound
entries"). Direct code read confirms TWO of the three named options are
genuinely implemented, not merely a file that exists: (a) the diagnostic —
`security-adapters/gitleaks.mjs`'s `run()` appends a near-miss message
naming both the old/new line and the literal `gitleaks-repair-ignore.mjs`
repair command to a blocked finding whose path+rule+column match an entry at
a different line; (b) the repair helper —
`gitleaks-repair-ignore.mjs`'s `repairStaleIgnoreEntry()` recomputes and
rewrites exactly the one named stale entry using the same
`gitleaksContentAuthorityLine()` digest arithmetic the scan itself uses,
touching no other entry. Both are covered by dedicated tests in
`security-adapters/gitleaks.test.mjs` ("flags a near-miss...",
"gitleaks-repair-ignore.mjs's repairStaleIgnoreEntry() recomputes...",
"...refuses when no entry matches..."). Re-ran: `node --test
plugins/pipeline-core/scripts/security-adapters/gitleaks.test.mjs` — 23/23
pass. The third option (binding to surrounding content instead of the line
index) was NOT built and is not required — the diagnostic + repair-helper
pair turns the original "costs a verify round to notice" failure into a
one-line, pointed-to fix, which is what the item's own Description names as
the actual cost worth removing.
