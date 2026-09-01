---
schema: pipeline.backlog-item.v1
id: pipeline.ledger-commit-discipline-rules-live-only-in-checkpoint-prose
type: workflow-improvement
owner: pipeline
status: closed
closed_at: 2026-09-01
closure_commit: 6c9f581f83252755c69ce8b382dc8bfdde63fe98
closure_repository: "self"
closure_evidence: guardrails/git.md
created: 2026-08-27
sprint: alfred
source: "Handover-rotation extraction pass over Phoenix checkpoints 61-71, 2026-08-27 (ADR-0066 Decision 6/7)"
done_when: contains guardrails/git.md GG-22
---

# Two ledger-commit rules exist only in checkpoint prose, and both have already cost time

## What was found

Rotating the Phoenix checkpoints out of `docs/state.md` requires reading them
first for durable rules with no home (ADR-0066 Decision 6/7 — the tool can hash
a section but cannot confirm anyone read it). That pass found two operational
rules that exist NOWHERE else in the repository.

### Rule 1 — a ledger reconciliation must be committed alone

From checkpoint 71 (2026-08-23), verbatim:

> `reconcile-backlog-ledger.mjs --activate` output must be committed in its own
> commit (GG-22 checks the full staged index, not the commit's pathspec) and
> needs `closure_commit` filled in on each closed item first.

Verified 2026-08-27: the token `GG-22` appears nowhere in `guardrails/git.md`,
and no guardrail, ADR or other backlog item states this rule.

It matters because it inverts the usual discipline. Everywhere else, agents are
told to scope a commit with `git commit -- <exact paths>`. Here that is not
enough: the guard inspects the WHOLE staged index, so an unrelated staged file
fails the commit regardless of the pathspec.

### Rule 2 — run the checker before committing any ledger change

From checkpoint 62 (2026-08-19):

> reason to `check-backlog-state.mjs` BEFORE committing ledger changes, always.

With the recovery technique that gives it teeth: a bad reconciliation that is
still UNCOMMITTED is undone with `git checkout --` on the three projection files
(`transitions.ndjson`, `index.json`, `STATUS.md`) and re-run against the
corrected item. Once committed, the same mistake needs
`planBacklogEvidenceAmendment`'s much heavier JSON-Result-bound machinery,
because the chain is append-only and hand-patching it breaks the chain.

Also there, and equally unhomed: `closure_commit` requires a FULL lowercase Git
OID. An abbreviated SHA looks fine to a human and bakes a schema violation into
the hash chain.

## Why this is worth filing rather than noting

Rule 2 has already been violated again, in this repository, on 2026-08-27 — six
backlog items were filed against a schema they did not satisfy (`type: decision`
and `owner: po`, neither of which exists in the enum) and the violation was
caught only by running `check-backlog-state.mjs` afterwards. Ten of the
thirteen findings in that run were self-inflicted.

That is the exact failure the rule prevents, recurring while the rule sat in a
checkpoint nobody re-reads. A rule whose only home is narrative prose in a
rotating handover file is not a rule the next session will follow.

## Proposal

Both belong in `guardrails/git.md` (the GG-numbered series it already hosts) or
in `backlog/README.md` next to the ledger's own documentation — whichever the
implementer judges the better fit, since one is a git-staging constraint and the
other is a backlog-tooling workflow. Define `GG-22` properly wherever it is
cited, since it is currently referenced by number and defined nowhere.

## Triage

- **Decision:** open, unassigned. Small and mechanical — two rules to write down
  in a place agents already read. The evidence that it is worth doing is that
  the second rule was broken again the same week it was rediscovered.
