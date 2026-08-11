---
schema: pipeline.backlog-item.v1
id: pipeline.guard-refuses-documented-bounded-diagnostic
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: b68b611417f8ab0b1adf7b9604fc391ec4e961cf
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-08
due: 2026-08-22
source: "Structured handover from the greenfield happy-path test of the local 0.5.4 build, 2026-08-08 (defect D-3). Independently hit in the Pipeline's own repository in the same session."
---

# The guard refuses the bounded diagnostic its own skill documents as permitted

## The contradiction

`pipeline-start` states the boundary in these words:

> Do not compose `&&`, `;`, redirects or pipelines except bounded,
> expansions-free `rg … | rg …` or `rg … | head -n 1..500` diagnostics.

A greenfield session then ran `rg -n "kickoff" <file> | head -n 60` — inside the
project, bounded, expansion-free, within the documented range — and the guard
refused it as `GUARD-OPERATOR-UNAPPROVED` with an empty `retryActions` array.

The same class was hit independently in this repository during the same session:
an `rg … | head` against a path **outside** the repository was refused under the
same code, which is a misleading label for what is really a cross-repository
boundary. Two observations, possibly two causes; they are filed together because
the visible symptom and the code are identical and the triage has to separate them.

## Why it matters more than a blocked diagnostic

An agent that is told a lane exists will use it, be refused, and then have to
choose between issuing more tool calls to work around a documented permission or
telling the human the documentation is wrong. Both cost the session, and the
second costs confidence. The rule and the enforcement disagreeing is worse than
either a narrower rule or a wider guard.

## A third instance, from the guard's own text this time

`git check-ignore -v pipeline.user.yaml` was refused as `GUARD-GATE-STRENGTH-SHELL`
in this repository on 2026-08-08. The refusal's own next sentence reads:

> Reading is unaffected: cat, rg, head, sha256sum and git diff/log/show on these
> paths are admitted.

`git check-ignore` is a read-only query — it prints which ignore rule, if any,
matches a path, and cannot alter anything. It is simply not in the enumerated
allow-list, and the list is stated in the refusal as though it were a description
of a category ("reading is unaffected") rather than what it is, a closed
enumeration.

This is the sharpest form of the defect in this item: the guard and its own message
disagree, in the same output, one line apart.

The dispatch that removed the stale hand-editing text from that file found this and
deliberately left it, because closing it widens what the guard admits and that was
outside its brief. That was the correct call and the reason it is recorded here
rather than lost.

Whether the fix is to extend the enumeration or to stop describing it as a
category is the decision, and it is the same decision as direction 1 below.

## Second finding in the same refusal

The refusal carried:

> No human override route is offered for this exact command; the guard attempted
> to plan one. Reason: planning the route failed with code `HGO-GIT-…`

in a repository that at that moment had **no commits at all**. Route planning
appears to require Git history and fails hard without it, so the very first
session in a fresh project — the one most likely to hit an unfamiliar refusal —
is also the one that cannot be offered a route out of it.

## Direction, not a design

1. **Establish which side is wrong**, per observation. For the in-repository
   `rg | head`: either the guard does not implement the documented exception, or
   it implements it more narrowly than the text (a flag form, a quoting form, a
   path shape). The answer decides whether the fix is in the guard or in the skill
   text — do not assume the guard is right because it is code.
2. **Give the outside-repository case its own code.** Refusing a cross-repository
   read under `GUARD-OPERATOR-UNAPPROVED` sends the operator to the grammar, which
   is not the reason. See also the cross-repository lift work of ADR-0059
   Decision 6, which now reports a typed reason for exactly this class.
3. **Make route planning survive an empty repository.** A fresh project has no
   commits; that must yield a plannable or honestly-unavailable route, not a hard
   failure.
4. **Pin whichever resolution is chosen**, with the documented example command as
   the fixture, so the text and the guard cannot drift apart again silently.

## Triggering situation

Fresh project, local `0.5.4+claude` build, Claude runner, before the first commit.
The outside-repository variant reproduces in any adopted repository.

## Related

- `2026-08-08-the-harness-classifier-blocks-the-onboarding-action-the-pipeline-just-authorized.md`
  — a different gate refusing an authorized action; do not conflate them, this one
  is the Pipeline's own guard.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
