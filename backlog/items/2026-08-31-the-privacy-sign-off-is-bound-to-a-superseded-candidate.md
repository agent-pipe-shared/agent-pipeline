---
schema: pipeline.backlog-item.v1
id: pipeline.the-privacy-sign-off-is-bound-to-a-superseded-candidate
type: defect
owner: pipeline
status: open
created: 2026-08-31
source: "Independent Critic privacy-sweep review (F2), specs/sprint-phoenix-epic/evidence/privacy-sweep-critic-review-4defe09e.md, candidate 4defe09ece85721747f039036356ef80aed1b084"
sprint: nova-b
done_when: manual
---

# The privacy sign-off is bound to a superseded candidate

## Description

`specs/sprint-phoenix-epic/design/privacy-review.md` §5 records its pass as
bound to commit `643c7d0623a43333b4597013ba96fa7c5990bdba`, tree
`449465e59ef250d2739140b60e95f0d774474c83`. The candidate reviewed by the
2026-08-31 Critic privacy sweep, `4defe09`, has a restricted-store surface
that has materially changed since that binding: a new restricted payload
schema (`pipeline.human-decision-attribution.v1`), a new validator, a new
kernel discrimination rule (`governance-event.mjs:180`), and a new 4096-
character free-text field (`MAX_RATIONALE_LENGTH`,
`human-decision-attribution.mjs:42`).

`privacy-review.md`'s own gate language requires "a fresh bounded re-review
before the design can reach the Product Owner gate". **No valid privacy
sign-off covers the 0.6.0 candidate.** Anyone reading §5's Status line as
satisfied for `4defe09` or later is relying on a stale binding.

## Triggering situation

Commissioned Critic privacy sweep, 2026-08-31, before `nova`'s next push to
origin (`specs/sprint-phoenix-epic/evidence/privacy-sweep-critic-review-4defe09e.md`,
finding F2).

## Affected artifact

`specs/sprint-phoenix-epic/design/privacy-review.md` §5 (privacy sign-off
binding).

## Proposal

Re-bind the section 5 privacy sign-off to the current candidate via a fresh
bounded re-review, as the document's own gate language already requires.
This means rewriting a digest-bound artifact of a closed epic
(`specs/sprint-phoenix-epic/lifecycle.json` binds a sha256 for
`design/privacy-review.md`) plus its digest index — a PO decision, not an
Elephant one.

## PO decision, 2026-08-31

Disclosed and accepted unremediated for the 0.6.0 release: 0.6.0 shipped with
this gap disclosed rather than remediated, by explicit PO decision. No valid
privacy sign-off covers the shipped candidate; remediation (a fresh bounded
re-review and re-binding §5) is deferred to `nova-b`.
