---
schema: pipeline.backlog-item.v1
id: pipeline.gs-1-signature-ceremony-has-no-light-path-for-a-chat-approved-trivial-config-edit
type: idea
owner: pipeline
status: open
created: 2026-08-17
source: "Relayed by the PO 2026-08-17 from a live D:\\Dev\\HA (native Windows Claude) session's handover; verified against source -- accurately described, and this repository's own gate-strength design is deliberately fail-closed here (see docstring cited below), so this is a feature-gap/enhancement request, not a defect."
---

# GS-1 gate-strength forces the full external Ed25519 signature ceremony even for a one-word, chat-approved `pipeline.user.yaml` edit during bootstrap

## Description

`readPushApprovalMode()` (`plugins/pipeline-core/lib/critical-human-proof-policy.mjs:128-154`)
returns `{mode: "signature", source: "uncommitted"}` whenever the working-tree
copy of the approval-mode configuration differs from the last committed one
— which mid-bootstrap (before the first project commit exists) is always
true. This is deliberate, documented fail-closed design (the function's own
docstring: "a gate whose configuration cannot be read is at its strongest
setting, never its weakest") — not a bug. Consequence in practice: even a
single-word edit the PO has just explicitly approved in the same interactive
chat requires the full external signature ceremony (multiple commands, an
externally-produced proof JSON, a private key held outside the session) —
disproportionate for a trivial, already-consented, in-session change.

## Triggering situation

A live D:\Dev\HA bootstrap session needed a one-line `pipeline.user.yaml`
edit the PO had just approved in chat. Every edit-tool attempt was blocked
(GS-1); the only working resolution was the PO editing the file directly
outside the agent session (humans are not subject to PreToolUse guards).

## Affected artifact

`plugins/pipeline-core/lib/critical-human-proof-policy.mjs` (`readPushApprovalMode`),
the GS-1..GS-5 gate-strength family it feeds.

## Proposal

Not designed here — this needs real security design input, not a quick
patch, since it trades a fail-closed guarantee for ceremony convenience.
Two directions worth weighing: (a) a lighter, still-auditable
"chat-confirmed inline edit" path for GS-1..GS-5 specifically scoped to
bootstrap-time config edits where the PO has just given explicit in-session
consent — bounded, logged, distinguishable from an unattended agent
self-edit; (b) tooling/automation to make the existing signature path itself
faster to execute for a trivial single-field change, rather than weakening
what it requires. Whichever direction, the fail-closed default outside that
narrow bootstrap-consent case must not regress.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted as a genuine, accurately-described friction point
  — NOT accepted as "fix the code," since the current behavior is
  deliberate, documented, fail-closed design working as intended. This is a
  design/enhancement item needing PO input on the security tradeoff, not a
  same-session or goldfish-dispatchable code fix.
- **Rationale:** weakening a fail-closed signature gate is exactly the kind
  of decision this repository's push-approval policy (CLAUDE.md, ADR-0056)
  reserves for explicit PO decision, not agent judgment.
- **Assignment:** queued for a future design/PO-decision session; not this
  candidate's scope, not agent-dispatchable as-is.
- **Date:** 2026-08-17
