---
schema: pipeline.backlog-item.v1
id: pipeline.git-09-still-calls-the-append-only-source-ledger-a-projection-file
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-01
closure_repository: self
closure_commit: 25c51c90c539545f264007140d92a2fc84690495
closure_evidence: guardrails/git.md
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Residual of Critic round NVA-CR-E finding F-2, reported by dispatch NVA-B-LEDGERRULE2-FIX as out of its own scope: the correction landed in GIT-10 (commit 1c2d2681) while GIT-09 keeps the same wrong phrase."
---

# GIT-09 still calls the append-only source ledger a projection file

## What is left over

A review of `GIT-10` found that `backlog/transitions.ndjson` was grouped with
`backlog/STATUS.md` and `backlog/index.json` as one of "the three ledger
projection files". It is not a projection: it is the append-only, hash-chained
source ledger, and the two others are generated from it. The checker keeps the
categories separate, and its success line enumerates "transition ledger, closure
evidence, and generated projections" as distinct things.

That was corrected in `GIT-10` by commit `1c2d2681`. `GIT-09` uses the identical
phrase in two places and was deliberately left untouched: only the commit under
review was in that dispatch's scope, and `GIT-09` predates it.

## Why the leftover is worth an item rather than a silent follow-up

The two rules sit adjacent in the same file and partner each other — `GIT-09` is
GG-22, `GIT-10` is the checker discipline. A reader moving between them now finds
the source ledger described correctly in one and incorrectly in the other, four
paragraphs apart. That is a worse state than the uniform error was, and it is the
predictable cost of a correctly scoped review: the dispatch was right not to reach
outside its candidate, which is exactly why the remainder needs its own record.

## The concrete risk

A reader who takes the phrase at face value may treat `backlog/transitions.ndjson`
as regenerable with `check-backlog-state --write` and reach for the wrong repair.
The correct repair for a committed bad ledger entry is the evidence-amendment
machinery, and hand-patching the chain breaks it — which is exactly the trap the
open item on ledger event 403's abbreviated OID is currently stuck in.

## What closing it looks like

Correct both occurrences in `GIT-09` to match `GIT-10`'s wording, and regenerate
the vendored canon copy. Note that this is guardrail canon, so it carries a
mandatory review round under trigger row T1 regardless of how small the diff is —
which is why it was not simply appended to the freeze-hour rework that found it.

## Closure, 2026-09-01

Closed via `ccc7df84` (the canon correction) and `25c51c90` (the vendored
regeneration), after the mandatory T1 round this item itself demanded.

The round returned a consistent trajectory and verified every requirement against
source rather than accepting the commit message's word for any of it:

- The new wording matches what `check-backlog-state.mjs` actually distinguishes —
  its success line separates ledger from projections, `writeBacklogProjections()`
  writes only `STATUS.md` and `index.json`, and drift detection covers only those
  two paths. The pre-image was inaccurate; the post-image is not.
- The allowed path set is identical: four paths before and after, re-grouped.
- The triggering condition and scope language are byte-identical, including the
  whole-staged-index semantics and the fresh-debt-from-history clause. Only a
  reflow moved one clause onto its own line.
- `git hash-object` returns the same OID for the canon and the vendored copy, and
  both commits' diff headers show the same blob transition — byte-identical
  before and after.
- Both hunks fall inside GIT-09; no neighbouring rule is touched.

One requirement produced an observation worth keeping rather than a finding: the
possessive "its two generated projections" slightly overstates the ledger's
ownership, since the projections are built from items AND ledger events. It was
dropped because GIT-10 carries the identical possessive and matching the
neighbour was itself a requirement. A reader who opens that script will notice
the two-argument call.

The round's own findings do not bear on this item. Its major finding is against
the Elephant's commit-message composition across six unrelated commits, filed
separately; its two minors are against an evidence artifact the Elephant supplied
and against a dispatch record's shape, the latter already filed.
