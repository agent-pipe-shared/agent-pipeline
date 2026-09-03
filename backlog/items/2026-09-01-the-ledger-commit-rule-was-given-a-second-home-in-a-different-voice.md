---
schema: pipeline.backlog-item.v1
id: pipeline.the-ledger-commit-rule-was-given-a-second-home-in-a-different-voice
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-03
closure_repository: self
closure_commit: 232eb5b0f98df987ca4801d437d7fc8bae010438
closure_evidence: backlog/evidence/2026-09-03-nova-b-batch-2-closure-verification.md
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Reported 2026-09-01 by dispatch NVA-B-LEDGERRULE2 as a finding outside its own acceptance criteria: the rule it was briefed to home in guardrails/git.md had already been homed in backlog/README.md hours earlier by NVA-B-GG22."
---

# The ledger-commit rule was given a second home the same day, in a different voice

## What happened

Two dispatches gave the same rule a durable home on 2026-09-01, in different
files, hours apart, neither aware of the other:

- `NVA-B-GG22` (commit `94d007ef`) wrote it into `backlog/README.md` — the
  checker-before-commit rule, the uncommitted-versus-committed recovery split,
  and the full-OID requirement.
- `NVA-B-LEDGERRULE2` (commit `6c9f581f`) wrote it into `guardrails/git.md` as
  the new `GIT-10`, with the same three elements plus a corrected script path and
  DRIFT-versus-FAIL severity semantics sourced from the checker's own code.

The source item's Proposal permitted either home. Nothing checked whether one had
already been taken.

## Whose mistake this is

The dispatcher's, and specifically a half-applied rule. Before briefing the
second dispatch, `guardrails/git.md` was checked for the rule's absence. Nothing
checked whether the rule had landed somewhere else in the meantime. CLAUDE.md's
re-verification rule names both halves — re-read the item's own current text AND
check `git log` for the area — and only the first was done.

The same half-application cost a whole dispatch earlier in the same session
(`NVA-B-STRIPFIX`, briefed against an item that had been fixed a week earlier).
Twice in one day makes it a methodological failure rather than an oversight.

The second dispatch behaved correctly throughout: briefed at a specific target,
it hit that target, and reported the collision as a finding outside its
acceptance criteria instead of quietly absorbing it or unilaterally "fixing" it.

## Why it needs resolving rather than leaving

This repository's stated thesis is that a rule has exactly one home, so there is
exactly one place it can drift. Two normative statements of the same rule, in two
voices, is the drift condition itself.

It is worse than symmetric duplication: the more precise of the two is the newer
one, because `GIT-10` carries the corrected script path. The older text names a
path that does not resolve. A reader who finds `backlog/README.md` first gets the
worse answer, and has no signal that a better one exists.

## Recommended direction, not decided

`guardrails/git.md` `GIT-10` becomes canonical — guardrails is where this
repository puts provable prescriptive rules, and `GIT-10` already sits adjacent to
`GIT-09`/`GG-22`, the rule it partners. `backlog/README.md` keeps its surrounding
backlog process context but defers the rule itself to `GIT-10` by reference
instead of restating it.

## What this does not block

`pipeline.ledger-commit-discipline-rules-live-only-in-checkpoint-prose` is
genuinely satisfied and closes against `GIT-10`: both rules it named now have
durable homes, which is what it asked for. This duplication is a new and
different defect, and holding the original item open against it would be
dishonest in the other direction.
