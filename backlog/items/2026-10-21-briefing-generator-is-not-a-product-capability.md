---
schema: pipeline.backlog-item.v1
id: pipeline.briefing-generator-is-not-a-product-capability
type: feature
owner: pipeline
status: open
created: 2026-10-21
source: "PO decision D78 2026-10-21, specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md"
sprint: alfred
done_when: manual
---

# The Goldfish briefing generator is sprint-local, not a product capability

## Description

Every Goldfish dispatch in the Alfred sprint is built by the sprint-local `scratch/make-briefing.mjs`
over the product's `scripts/dispatch-briefing.mjs binding`. The product itself only emits a binding
block and a six-field skeleton with placeholders; filling the fields stays a freehand act in every
other repository, which is the failure mode CLAUDE.md's "Dispatch from the template, never freehand"
rule describes. Measured gaps the sprint wrapper had to close one by one: briefed paths that did not
exist, a missing project/calibration identity for the bootstrap line (a Goldfish stopped on it,
2026-10-21), and write scopes that overlapped a running dispatch.

PO decision D78: the generator is a product capability, shipped and used by default in every user
repository.

## Acceptance

- One plugin command builds the complete briefing from a closed package file (goal, context,
  targeted checks, forbidden, stops, model rationale): the binding block, the native host-commit
  rule, the return contract and all six fields of `templates/prompts/goldfish-task.md`.
- Every path the package names exists unless it is declared new; the calibration bullet names the
  repository's own calibration file, project and handover; refusals are typed and name the repair.
- The rendered briefing carries a generator marker whose digest covers the rest of the text; a
  hand-edited briefing fails its verification.
- The dispatch hook refuses a Goldfish dispatch whose prompt is not a verified generated briefing,
  with a message naming the generator command (default route in every repository).
- Runner-neutral (Claude, Codex, Antigravity) and platform-neutral (Linux, WSL, macOS, Windows).
- Sprint-local parts (the correction-ledger cluster admission) stay out of the product.
