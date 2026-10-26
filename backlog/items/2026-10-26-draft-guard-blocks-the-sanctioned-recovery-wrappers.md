---
schema: pipeline.backlog-item.v1
id: pipeline.draft-guard-blocks-the-sanctioned-recovery-wrappers
type: defect
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
sprint: alfred
source: "PO relay of the Toolbox consumer handover (Windows, 2026-10-26, findings D21 and the open rest of D3): phoenix-authority-revision.mjs plan|apply and materialize-architecture are refused in draft as opaque-script-execution"
done_when: manual
---

# The draft guard blocks the sanctioned recovery wrappers the agent is told to use

## Evidence

- D21: `phoenix-authority-revision.mjs plan|apply` is refused in draft by `guard-devplan` (`GUARD-DEVPLAN-SHELL`,
  `opaque-script-execution`); the human override needs a further ceremony. The PO ran both in the own terminal and wrote
  the `plan` output to a file by hand (UTF-8 without BOM): `plan` has no `--out`. `apply` requires an undocumented
  `--lock-token` (8-128 characters, free).
- D3 remainder: `D165-S1` admitted `architecture-adoption.mjs propose|status|check|prepare`, `architecture-measure.mjs`
  and `architecture-fitness.mjs`; `pipeline-state.mjs materialize-architecture` is still refused in draft/approved.
  (`reopen-design` without `--by` stays refused on purpose, EL-36.)

## Wanted

- Admit the read-only or sanctioned argv shapes of these wrappers in the draft/approved shell lane (exact argv, as the
  preflight returns them); add `--out` to `plan` and document `--lock-token` in the usage line.
- Regression: admitted shapes pass in draft and approved, foreign flags and roots refuse.

## Notes

Guard command catalogue is a kernel path: a held patch applied by the PO as operator.
