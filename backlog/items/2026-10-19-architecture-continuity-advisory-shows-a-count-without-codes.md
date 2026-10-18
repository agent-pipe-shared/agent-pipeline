---
schema: pipeline.backlog-item.v1
id: pipeline.architecture-continuity-advisory-shows-a-count-without-codes
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "real greenfield project report 2026-10-19 (PF-22)"
sprint: none
done_when: manual
---

# Architecture continuity advisory shows a count without codes

## Description

After materialization with plain Markdown ADRs, `set-phase --phase implementation` and the
preflight report `ARCH-CONTINUITY-ADVISORY` per module with `status: advisory`,
`decisions: []` and `findingCount: 11`, but no finding codes. The 11 ADRs under `docs/adr/`
have no `pipeline.architecture-decision.v2` sidecars, so each finding is probably
`legacy-decision-without-sidecar`. Only the count is visible, so the operator cannot tell what
to do.

## Triggering situation

`set-phase --phase implementation` in a consumer project whose ADRs have no sidecars.

## Proposal

Report the advisory codes (grouped with counts) next to `findingCount`, and name the repair
route for `legacy-decision-without-sidecar`.

## Acceptance

- The advisory output names each finding code with its count, and a pin covers the
  sidecar-less ADR case.
