---
schema: pipeline.backlog-item.v1
id: pipeline.codex-worker-subagent-dispatch-capability-is-broken
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova-b
tracking: "Nova B -- needs deeper Codex-runner-side investigation, likely outside pure Pipeline-repo code; not a same-session fix."
source: "Codex 060-77 greenfield retrospective (scratch/greenfield-reports/pipeline-retrospective-codex-060-77.md), section 'Root und Worker hatten unterschiedliche Funktionsfähigkeit'."
---

# Codex: dispatched worker/subagent sessions cannot establish their own repository-control capability -- the Goldfish dispatch model is unusable on this runner

## What happens

In the Codex 060-77 greenfield run, the root/Elephant session bootstrapped successfully, but
TWO separately dispatched worker sessions -- a generic "author" worker and an explicit
"implementor" worker -- both received `repository-control-path-invalid` /
`session-capability-unavailable` and could make no changes at all. Both failed closed
(no mutation occurred), but this makes the entire Goldfish-dispatch model (EL-01/EL-16,
"every implementation is a briefed Goldfish dispatch") practically unusable in the Codex
runner as currently integrated -- there is no working delegation path.

## Relation to existing items

`2026-08-10-control-path-invalid-misfires-on-a-transient-repository-discovery-race.md`
(closed) addressed a TRANSIENT race producing this same error code. This report describes a
total, reproducible failure across two independent worker dispatches in the same session --
a materially different severity/reproducibility profile than "transient race," and worth
treating as a distinct, larger defect rather than assuming the closed fix covers it.

## Direction

Needs live reproduction against the current Codex adapter before a fix shape can be proposed
-- this may be a Pipeline-side dispatch/session-capability-attestation bug, or a Codex-CLI-side
limitation outside this repo's own code. Scope that determination first.

## Acceptance criteria

- A controlled reproduction against current code either confirms this is the same closed
  transient-race class (in which case: why did the fix not hold here?) or identifies it as a
  distinct defect with its own root cause.
- Once root-caused: Goldfish dispatch succeeds end-to-end against a real Codex worker session.

## Triage

- **Decision:** accepted, Nova B (needs investigation before a fix can be scoped; not a
  same-candidate fix)
- **Rationale:** severity is high (breaks the core delegation model on one runner) but scope
  is undetermined -- premature to dispatch a fix without first reproducing/root-causing.
- **Date:** 2026-08-29
