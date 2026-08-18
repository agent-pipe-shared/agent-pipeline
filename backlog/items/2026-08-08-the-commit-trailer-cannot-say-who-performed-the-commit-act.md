---
schema: pipeline.backlog-item.v1
id: pipeline.commit-trailer-cannot-distinguish-authorship-from-commit-act
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "Raised as finding F3 by an independent Critic review on 2026-08-08. A dispatch authored a diff but stopped before committing it; the orchestrator performed the commit act. The resulting trailer is textually identical to one whose dispatch committed its own work, and the deviation was discoverable only from a separate document that git does not bind."
due: 2026-09-07
---

# The `Dispatch:` trailer cannot distinguish who authored the diff from who performed the commit act

## Description

`templates/prompts/goldfish-task.md` makes the trailer the primary authorship
evidence:

> `Dispatch:` is the deterministic work-package authorship evidence for close
> step 6b and the Critic

and `templates/prompts/critic-review.md` builds the EL-01/EL-16 authorship check
on it: orchestrator-authored production diffs outside the stage-0 fast path are a
lifecycle violation of at least major severity, and the Critic is told to decide
that question from "commit/session trailers, dispatch records."

The trailer carries exactly one fact — which dispatch the work belongs to. It
cannot express the case that actually occurred:

| what happened | what the trailer says |
| --- | --- |
| dispatch authored the diff AND committed it | `Dispatch: X (goldfish)` |
| dispatch authored the diff, orchestrator committed it | `Dispatch: X (goldfish)` |

The two are indistinguishable from git. In the incident that raised this, the
orchestrator disclosed the deviation in a review record — a file the Critic
happened to be given, that git does not bind to the commit, and that a later
reader of `git log` would never see.

## Why this matters beyond bookkeeping

The check exists to catch an orchestrator quietly writing production code. The
current convention catches the *blatant* form — no trailer at all — and is blind
to the partial form, which is the one that actually happens under time pressure:
a dispatch stops mid-run and the orchestrator finishes the last step "just to get
it landed."

That partial form is also the one with a sanctioned alternative. `roles/elephant.md`
EL-13a already says the response to a truncated dispatch is a resume-nudge into
the same context or a fresh re-dispatch. So the process answer exists; what is
missing is any way for the artifact to record that the answer was not taken.

There is a second, sharper consequence. A Critic that finds the trailer well-formed
has no signal to look further, so the *only* thing standing between this deviation
and an unnoticed pass is whether the orchestrator volunteers it in a document it
was not required to write. Evidence that depends on the reviewed party's candour
is not evidence.

## Proposed repair

1. **A second trailer line, present only when the two differ.** For example
   `Commit-Act: orchestrator` alongside the existing `Dispatch:` line. Absent by
   default, so nothing changes for the normal case, and its presence is a fact
   git carries and `git log` shows. This is the cheap fix and should ship first.
2. **Make its absence checkable.** A dispatch record whose logged phases stop
   before a commit phase, paired with a landed commit carrying that dispatch's
   trailer and no `Commit-Act:` line, is a mechanically detectable inconsistency.
   That check belongs next to the existing authorship check rather than in a
   reviewer's judgement.
3. **State it in the templates.** Both `goldfish-task.md` and `critic-review.md`
   describe the trailer as authorship evidence without qualifying which act it
   evidences. Say which.

Note that repair is only ever forward-looking here: history is not rewritten in
this repository, so an already-landed commit of this shape stays as it is and
can only be corrected by a record outside git — which is precisely the weakness
this item describes.

## Related

- `2026-08-07-dispatches-report-completed-on-a-truncated-fragment.md` and
  `2026-08-07-dispatched-agents-return-truncated-mid-step.md` — the upstream
  condition. Truncated dispatches are what create the temptation this item is
  about; three occurred in a single session on 2026-08-08.

## Triage — 2026-08-18

- **Decision:** accept-open, dispatch-ready.
- **Rationale:** Re-verified 2026-08-18 — no `Commit-Act:` trailer or equivalent mechanism exists in Phoenix's templates/guardrails/roles, and none exists in the sibling Nova checkout either. The three-part proposed repair (a conditional `Commit-Act:` trailer line; a mechanical dispatch-record-vs-commit consistency check; wording updates to `goldfish-task.md`/`critic-review.md`) is fully specified engineering work, no PO design tradeoff involved.
- **Assignment (if accepted):** owner `pipeline`; dispatch before the 2026-09-07 due date already carried on this item.
- **Date:** 2026-08-18
