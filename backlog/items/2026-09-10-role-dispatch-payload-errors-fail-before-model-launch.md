---
schema: pipeline.backlog-item.v1
id: pipeline.role-dispatch-payload-errors-fail-before-model-launch
type: defect
owner: pipeline
status: open
created: 2026-09-10
sprint: nova
done_when: manual
source: "PO observation during 0.6.2 candidate review: malformed or incomplete role dispatches repeatedly consumed roughly ten minutes before reporting a coordinator/payload failure. The requirement applies to every role, not only Critic."
---

# Role dispatch payload errors fail before model launch

## Problem

Advisor, Critic, Goldfish, Elephant and other configured roles can reach an
expensive launcher before the dispatch packet has been proven usable. Missing
fields, wrong paths, stale candidate bindings or an invalid role contract may
therefore surface only after a model timeout. Repeating the launch multiplies
the delay and obscures the actual coordinator defect.

## Required behavior

- One shared, runner-neutral preflight validates the complete dispatch packet,
  role identity, required paths, candidate binding and result destination
  before any model, App Server, PTY or external launcher starts.
- Claude Code, Codex and Antigravity adapters consume the same verdict. Every
  supported role is covered; Critic-specific validation is only an extension
  of the common contract.
- Invalid input returns a bounded structured diagnostic naming the failing
  field and exits before model launch. The normal local target is under five
  seconds.
- Tests prove that each invalid fixture makes zero launcher/model calls and
  that a valid fixture reaches its intended role unchanged.
- Batch execution reports `PREPARE` success or failure for every packet before
  printing the first `START`, so one bad packet cannot waste a long-running
  review slot.

## Scope note

This item records the follow-up without changing the current candidate's role
or launcher architecture. The 0.6.2 hardening fix only adds bounded filters and
timeouts to affected test harnesses so a local infrastructure stall becomes
visible promptly.
