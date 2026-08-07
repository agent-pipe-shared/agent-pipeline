---
schema: pipeline.backlog-item.v1
id: pipeline.self-application-integrity-check-absent
type: defect
owner: pipeline
status: open
source: merge report section 4 findings 7 and 9 (specs/sprint-phoenix-epic/evidence/merge-0.5.2-what-fell-away.md gitignored evidence artifact); merge commit 75b8361
created: 2026-08-07
---

# The self-application / public-marketplace-origin allowlist integrity check is gone

## Description

The 0.5.2 merge (`75b8361`, local only) dropped a paired mechanism:

- `plugins/pipeline-core/lib/codex-host-plugin-list.mjs` —
  `observeCodexRulesetSource`, which checked that a Codex ruleset's origin
  matched a self-application/public-marketplace allowlist.
- `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs` — the
  bootstrap-preflight wiring that invoked the check above during ordinary
  session start.

Both resolved to main's versions, which took the file in an unrelated
direction and dropped the integrity check respectively. The paired test
`plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs` now fails with a
`SyntaxError` (`observeCodexRulesetSource` no longer exported) — confirmed by
direct execution against the merged tree, not just a diff read.

## Triggering situation

Merge conflict resolution, code-conflict batch (28 files, origin/main taken
verbatim per PO's same-function policy). Test failure independently
reproduced in the merge's full 341-file direct sweep.

## Affected artifact

`plugins/pipeline-core/lib/codex-host-plugin-list.mjs`,
`plugins/pipeline-core/lib/codex-host-plugin-list.test.mjs`,
`plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`.

## Proposal

No proposal yet. Needs a decision on whether main's self-application model
already covers this integrity concern by other means (main's file went in
its own direction rather than simply deleting the functionality — worth
checking what it does instead before assuming a straight gap) or whether
Phoenix's allowlist check needs to be redesigned against main's current
bootstrap-preflight shape.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
