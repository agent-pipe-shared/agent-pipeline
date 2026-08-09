---
schema: pipeline.backlog-item.v1
id: pipeline.commit-trailer-block-wrapped-continuation-line-parses-as-empty
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Independent Critic FAIL (2026-08-09, F6) on a full-range review of the Phoenix measurement/closure wave."
due: 2026-09-08
expires: 2026-09-08
---

# A commit trailer block with a wrapped continuation line parses as empty

## Description

Commit `78c6ef1`'s final paragraph reads:

```
Dispatch: none -- Elephant, under the active signed maintenance window
(evidence/phx-p-ac-08-gmw-request.json, scope TP-3+TP-5).
AI-Assisted: true
```

The first line wraps onto an unindented continuation line
(`(evidence/phx-p-ac-08-gmw-request.json, scope TP-3+TP-5).`). Git's trailer
parser requires each trailer to be a single unwrapped `Key: value` line; a
wrapped continuation breaks the whole block. `git log -1 --format=
'%(trailers:only=true,unfold=true)' 78c6ef1` returns nothing — not even the
`AI-Assisted: true` line two lines below the wrap, which is itself
well-formed. `guardrails/git.md` GIT-03's own sample verification command
(`rg "^AI-Assisted: true$"` over the raw body) still matches, since it does a
line-anchored text search rather than structural trailer parsing — so this
defect is invisible to the check GIT-03 currently documents, and only shows
up under `git log --format='%(trailers...)'`.

## Triggering situation

Live, 2026-08-09, in the one commit of the Phoenix measurement/closure wave
written directly by the Elephant rather than a dispatched Goldfish (see the
sibling item `pipeline.elephant-authored-production-diff-closed-its-own-
gating-criterion` for why that commit exists at all) — the Elephant composed
this trailer block by hand rather than through the goldfish-task template's
committing convention, which none of the wave's other ~15 commits deviate
from.

## Affected artifact

The one landed commit `78c6ef1` (not proposed for amendment — amending a
landed commit to fix formatting is a separate, larger decision than filing
the gap, and this repo's convention is new commits, not amends);
`guardrails/git.md` GIT-03's verification guidance, which does not currently
distinguish "the text `AI-Assisted: true` appears somewhere in the body" from
"the trailer block is structurally well-formed and machine-parseable."

## Proposal

Not designed here. Candidates for a future session:

1. Add a structural check to whatever pre-commit or post-commit hook already
   enforces the `Dispatch:`/`AI-Assisted:` trailer presence: run
   `git log -1 --format='%(trailers:only=true)'` (or the pending commit's
   equivalent) and fail if it's empty when the raw body text suggests
   trailers should be present.
2. Update `guardrails/git.md` GIT-03's own sample command to structural
   trailer parsing rather than a line-anchored grep, so the check actually
   verifies what the rule claims to guarantee.
3. A narrower fix scoped just to hand-authored commits (the rare case where
   an Elephant commits directly, per the sibling item's proposal #3): require
   the trailer block to be composed via a small script/snippet rather than
   free-hand prose, removing the wrap risk structurally.

## Triage (filled in by the Elephant of the next Pipeline session)

Not yet triaged. Filed same-session as the finding, alongside the sibling
authorship-defect item, at the point of reconciling the Critic's FAIL
verdict.
