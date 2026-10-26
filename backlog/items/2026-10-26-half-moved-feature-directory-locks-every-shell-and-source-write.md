---
schema: pipeline.backlog-item.v1
id: pipeline.half-moved-feature-directory-locks-every-shell-and-source-write
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
sprint: alfred
source: "PO relay of the Toolbox consumer handover (Windows, 2026-10-26, findings D14 and D18): a half-finished move of the bound spec folder locked every shell and every source write, including scratch/"
done_when: manual
---

# A half-moved feature directory locks every shell and every source write, including the repair

## D14 (dead end)

`git mv .../prd_<slug>.md specs/<slug>/` ran; the second `git mv` (spec.md) was refused with
`GUARD-LIFECYCLE-NOT-READY ... PORG-INVALID-OBSERVATION`, PowerShell too (`GUARD-POWERSHELL-GRAMMAR`). Cause:
`project-onboarding-v3.mjs inspect` with the PRD missing at the bound path returns
`nextAction.kind: architecture-design-required` (`ARCHITECTURE-DESIGN-ENOENT`), a shape that fails the ready-gate form
check; the guard demands "use only its returned nextAction", which says only "resolve the diagnosed condition", so the
repair (move the file back or on) is blocked as well. The preflight reports `continuityAuthorityDrift`
(route `continuity-authority-revision-plan --proposal-file`); the inspection says "Do not reopen design". The two hints
contradict each other. Exit used: the PO ran `git mv` in the own terminal.

## D18 (EL-01 tripwire)

`guard-el01-tripwire`: "spec ... cannot be read (ENOENT)" fails closed (PO decision D86) and blocked even `scratch/`
edits; its repair text ("create or restore specs/<old path>/spec.md") contradicts a path rebind. Only writes under
`specs/` stayed possible until the rebind.

## Wanted

- For diagnosed inspection codes the guard does not fall to fail-closed "invalid observation"; it admits only repair
  commands (git mv/restore on the bound paths), or a sanctioned `relocate-authority-artifact` exists.
- The tripwire reads the spec through `continuity.authority.spec.path` instead of the plan path, and `scratch/` is not
  part of the source write lock.
- Inspection and preflight give one consistent next step for this state.
- Regression: PRD missing at the bound path with the spec present: repair `git mv` admitted, source write to
  `scratch/` admitted, production source write still refused.
