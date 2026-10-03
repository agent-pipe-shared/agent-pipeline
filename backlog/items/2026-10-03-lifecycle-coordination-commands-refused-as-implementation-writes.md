---
schema: pipeline.backlog-item.v1
id: pipeline.lifecycle-coordination-commands-refused-as-implementation-writes
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Claude/Windows greenfield analysis 2026-10-03 (Claude test repo docs/pipeline-analyse-greenfield.md, findings V-1, V-4, V-6, V-8) and the Agent-Pipeline Claude/Windows session of the same day."
sprint: alfred
done_when: manual
---

# Lifecycle coordination and read-only tooling are refused as implementation writes

## Description

In `draft` and `awaiting-approval`, the dev-plan gate classifies Pipeline
coordination commands and read-only tooling as implementation writes
(`GUARD-DEVPLAN-SHELL`, lanes `opaque-script-execution`, `git-working-tree-write`,
`write-command`). The design course can therefore not be finished without
guard overrides, which costs PO signatures that have no gate meaning.

Observed instances:

| Case | Lane | Source |
|---|---|---|
| `pipeline-state continuity-cas` (the only route to register the authoring dispatch the course demands) | opaque-script-execution | Claude analysis V-1, T:956/T:982 |
| `integrate-final` to finish a registered dispatch before `submit-plan` (`PLAN-SUBMIT-CONTINUITY-BUSY`) | opaque-script-execution | V-4, T:1090 |
| `cancel-submitted-plan` | refused | Claude analysis §5, T:961 |
| Advisor producer invoked directly | refused | V-2, T:1108 |
| Onboarding scaffold commit (`.gitignore`, `AGENTS.md`, `architecture/`, `pipeline.user.yaml`, `project/`) refused by commit-msg hook in draft | commit hook | V-6, T:400 |
| Read-only `node scratch/forensics.mjs` | opaque-script-execution | V-8, T:1227 |
| Mandatory bootstrap preflight with forward-slash or `${PIPELINE_PLUGIN_ROOT}` spelling | opaque-script-execution | V-7; item `2026-10-03-draft-phase-guard-blocks-mandatory-bootstrap-preflight.md` |
| `node harness/scripts/check-observation-governance.mjs`, the checker the F6 recovery itself prescribes | opaque-script-execution | Agent-Pipeline session 2026-10-03 |
| `git stash list` | git-working-tree-write | item `2026-10-03-git-stash-list-classified-as-working-tree-write.md` |
| Inventory repair in `governance/observation-doc-governance.json` needed by the F6 recovery | write-command | Agent-Pipeline session 2026-10-03 |

## Acceptance

- Lifecycle coordination commands that a Pipeline `inspect`/`nextAction`
  emits are never opaque implementation writes. They are admitted by closed
  argv identity in every phase where they are offered. Spelling (backslash,
  forward slash, MSYS) is normalised before matching.
- Read-only scripts under `scratch/` and repository checkers that a recovery
  path prescribes are admitted as read-only execution.
- Onboarding scaffold paths are committable in every phase, or onboarding
  commits them itself.
- The governed repair a typed recovery (such as F6) prescribes is reachable
  without a guard override.
- A design-course end-to-end test on Windows (Git Bash) reaches `present-plan`
  with zero overrides.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
