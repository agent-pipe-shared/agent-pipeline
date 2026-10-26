---
schema: pipeline.backlog-item.v1
id: pipeline.fitness-class-6-blocks-documentation-modules-without-a-verification-entry
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
sprint: alfred
source: "PO relay of the Toolbox consumer handover (Windows, 2026-10-26, finding D9): GUARD-ARCHITECTURE-FITNESS-NON-GREEN from class 6 for a documentation module"
done_when: manual
---

# Fitness class 6 blocks a documentation module that has no verification entry point

## Evidence

`architecture-fitness.mjs:537-595`: a module with `verificationEntryPoints: []` yields a `finding`, hence
`GUARD-ARCHITECTURE-FITNESS-NON-GREEN` (remedy `verification-locality:localize-contract`). A pure documentation module
has no natural entry point. The consumer registered `.github/workflows/ci.yml` as the entry point (semantically thin).
Changing that file changed the module snapshot hash recorded in the signed adoption and forced a second adoption round
(one more PO signature).

## Wanted

- Exempt documentation modules (no executable code) from class 6, or report-only for modules without executable code.
- Decide whether a module snapshot hash change that only reflects an entry-point declaration must invalidate the signed
  adoption (cost: one signature per correction).
- Regression: documentation-only module is not a finding; a code module without entry point still is.
