---
schema: pipeline.backlog-item.v1
id: pipeline.no-gate-catches-a-named-design-requirement-silently-absent-from-shipped-code
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-29
sprint: nova-b
done_when: manual
source: "PO judgment plus Claude/Windows audit section 3.1 from the 2026-08-29 three-runner greenfield test (finding F30 of scratch/greenfield-triage-2026-08-29.md), Antigravity/WSL run."
---

# No gate catches a design document's named requirement being silently absent from the delivered artifact

## What happened

The one run that shipped code (Antigravity) delivered a game the PO judged
unplayable by his own test. Separately, the audit found that the design
document's explicit keyboard-operability requirement was entirely absent
from the shipped code (no `keydown`, `tabindex`, or `aria-*` anywhere) and
that a sound-toggle menu item named in the design was dropped. The run
"shipped" while silently missing named requirements, and no pipeline gate
caught either omission.

**This item is scoped to the pipeline gate question only.** Per this
dispatch's briefing, the game's own bugs and its general unplayability are a
consumer project's business, not this repository's, and are explicitly
outside scope here.

**What this item does NOT claim**, per the source triage's own disclaimer:
the game's unplayability was not reproduced in this repository — it rests on
the PO's own test plus the audit's requirement-gap analysis, not a
controlled repro run from this repository.

## Where it is

Behavioural/process gap, not a located code defect — there is no single
function whose absence explains this, because the gap is the absence of an
entire check category. The candidate artifacts that WOULD have to change:

- The Critic review contract (`docs/adr/0014-critic-contract.md`,
  `roles/critic.md`) — whatever review tier gates a shipped feature does not,
  as read, include "cross-check the delivered artifact against every
  explicit named requirement in the design document it was built from" as a
  distinct check category; it reviews code quality and guardrail/security
  surface, not requirement-completeness against the design doc.
- `harness/checklists/session-close.md` / the close-block flow — the
  natural place a "did every named requirement land" check would run before
  a feature is considered done, if no earlier gate catches it.
- Whatever DoD/acceptance-criteria mechanism a feature's own spec carries
  (EARS acceptance criteria, per `roles/elephant.md` §2 row 1) — if the PRD
  itself listed keyboard-operability and a sound toggle as acceptance
  criteria, a check that the shipped artifact satisfies each listed
  criterion, rather than only that some code exists, is the missing
  mechanism.

## Proposal

Add a requirement-traceability check to the gate that already runs closest
to "feature considered complete" — most naturally the Critic review or a
close-block step — that walks the named, falsifiable requirements/acceptance
criteria out of the feature's own spec/PRD and checks each one against the
delivered artifact (a grep-able marker where mechanically checkable — e.g. a
named menu item's presence, a `keydown` handler's presence for a stated
keyboard requirement — or an explicit manual confirmation where it is not).
This does not require solving general requirement-satisfaction (an
unbounded problem); it requires that requirements STATED EXPLICITLY AND
NAMED in the design document are checked for PRESENCE, which is a much
narrower and mechanically tractable question than whether they work
correctly.

## Acceptance

- A feature's spec/PRD can name a requirement in a form checkable against
  the shipped artifact (e.g. "must contain a keyboard input handler", "must
  contain a sound-toggle UI element"), and a gate — Critic review or
  close-block — reports each such named requirement as present/absent before
  the feature is considered shippable.
- A requirement named in the spec but absent from the delivered code is
  reported as a named, specific finding (not folded into general code
  review prose) before that feature can be marked done.
- The check is scoped to requirements the spec ITSELF names explicitly —
  it does not attempt to infer unstated requirements or judge subjective
  playability, both of which stay outside a mechanical gate's reach.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — PO confirmed Nova B, 2026-08-29.
- **Rationale:** real architecture work (Critic-review contract, close-block
  flow, DoD mechanism), no concrete 0.6.0-blocking incident behind it.
- **Assignment:** `sprint: nova` — Nova B, not a 0.6.0 candidate blocker.
- **Date:** 2026-08-29
