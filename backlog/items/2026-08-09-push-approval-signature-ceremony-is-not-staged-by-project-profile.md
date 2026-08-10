---
schema: pipeline.backlog-item.v1
id: pipeline.push-approval-signature-ceremony-is-not-staged-by-project-profile
type: idea
owner: pipeline
status: closed
created: 2026-08-09
closed_at: 2026-08-10
closure_repository: self
closure_commit: 4b730f41e036238369a5aba74057139f8581ed88
closure_evidence: backlog/evidence/2026-08-10-push-approval-profile-staging-declined.md
source: "Live Claude+Pipeline 0.5.4 greenfield test session, 2026-08-09 (session 6c12cf91) — a static three-file browser game with an explicitly stated 'no backend, no install' scope still went through the full signed push-approval ceremony."
due: 2026-08-23
---

# Should `push_approval: signature` be staged by project profile instead of applying uniformly to every project?

## What happened

For a tiny, static, no-backend three-file browser game, the total onboarding
+ push-approval overhead was roughly 80 tool calls for the push-approval
sequence alone (measured directly from the session transcript). `gates.push_approval`
is a single, global `pipeline.user.yaml` value (`signature` by default,
per ADR-0056); even selecting a "mini" project profile would not skip or
lighten the signature ceremony, since the setting is not staged per profile.

## Why this is a PO/policy decision, not an implementor's call

The signature ceremony's threat model, its commit-exact binding, and its
non-bypassable design are all deliberate, already-ratified security
properties (ADR-0056, ADR-0061) — this item does not question whether they
are correct in general. It asks a narrower, genuinely open question: should
a declared low-risk profile (no backend, no deployment target, no
third-party data) be allowed a lighter-weight push clearance path (e.g.
`chat` mode by default, or an explicit PO opt-out) without weakening the
guarantee for any project that doesn't opt into that profile? This changes
the security posture's DEFAULT for a class of projects, which is exactly the
kind of tradeoff that belongs to the PO / a proper ADR discussion, not to an
overnight implementation pass.

## Direction

Raise as a design question, not a same-night fix: is there a legitimate
"mini"/static-content profile shape where `push_approval: signature` should
default to `chat` instead, and if so, how is that profile detected/declared
without becoming a bypass an agent could self-select to weaken governance
elsewhere.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Declined — option A (leave `push_approval: signature` global,
  no per-profile staging), per explicit PO decision, 2026-08-10.
- **Rationale:** PO's own words: "das Spiel ist nur ein Test für solche Mini
  Sachen ist die Pipeline eh nicht gedacht" — the tiny static game that
  surfaced this complaint was itself only a test scenario; the Pipeline is
  not intended for projects at that scale in the first place, so the
  overhead this item measured is not representative of the Pipeline's
  actual target use and does not justify weakening the signature default
  for any project class.
- **Assignment:** n/a — declined, no implementation follows.
- **Date:** 2026-08-10
