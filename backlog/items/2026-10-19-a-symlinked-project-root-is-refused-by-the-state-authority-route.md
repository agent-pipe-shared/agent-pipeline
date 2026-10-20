---
schema: pipeline.backlog-item.v1
id: pipeline.a-symlinked-project-root-is-refused-by-the-state-authority-route
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "Elephant decision E18 (2026-10-19): the RGt block of harness/scripts/pipeline-state.test.mjs, ceremony C4 c-3"
sprint: none
done_when: manual
---

# A symlinked project root is refused by the state authority route

## Description

The harness pipeline-state suite once proved that feature-package
reconciliation works, and reuses its lock, when `CLAUDE_PROJECT_DIR` is a
symlink to the checkout. The state authority route now refuses such a root
with `State authority route unavailable (WT-PATH-TYPE)`
(`plugins/pipeline-core/lib/worktree-lifecycle.mjs`,
`assertExistingDirectoryPhysical`). E18 retargets the case to that typed
refusal and keeps the old admit-side tail dormant.

## Acceptance

- A decision states whether a symlinked project root is supported.
- If it is supported: the route resolves the root to its physical path once,
  binds every later check to that path, and the dormant admit tail runs live
  again.
- If it is not supported: the refusal names the physical path to use instead,
  and the dormant tail is removed with a QG-04 justification.

## Triage

Medium (D6/D10): the refusal is fail-closed, and no 0.7.0 flow is known to
need a symlinked root.
