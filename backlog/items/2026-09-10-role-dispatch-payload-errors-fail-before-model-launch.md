---
schema: pipeline.backlog-item.v1
id: pipeline.role-dispatch-payload-errors-fail-before-model-launch
type: defect
owner: pipeline
status: open
created: 2026-09-10
sprint: nova-b
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

## Greenfield 0.6.2 evidence — 2026-09-11

The Claude greenfield analysis records a malformed Critic packet that reached
the expensive path, produced zero model turns, ran for 30 seconds and consumed
50,629 tokens. A separate Nova candidate-review batch also rejected incomplete
verdict/assurance fields at packet preparation once the normal session Critic
route was restored. Long successful model reviews are not evidence for this
defect; the target is specifically invalid input reaching any launcher.

This sharpens the acceptance test without changing the planned sprint: every
role/runner fixture with an invalid required field must terminate during
`PREPARE`, within the local five-second bound, and prove zero launcher calls.
See `backlog/evidence/2026-09-11-greenfield-062-three-runner-findings.md`.

## Triage — 2026-09-11

- **Decision:** accepted for Nova B; no additional 0.6.2 release blocker was
  established after the bounded harness timeouts and normal session-Critic
  route were restored.
- **Priority:** first cost-reduction implementation in Nova B. The measured
  malformed packet spent 30 seconds and 50,629 tokens without a model turn;
  the shared preflight prevents the same class across every role and runner.
- **Boundary:** do not implement this as five adapter-local validators. The
  common verdict and zero-launch tests land first; runner and role extensions
  consume that result.
