---
schema: pipeline.backlog-item.v1
id: pipeline.push-approval-signature-ceremony-is-not-staged-by-project-profile
type: idea
owner: pipeline
status: open
created: 2026-08-09
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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
