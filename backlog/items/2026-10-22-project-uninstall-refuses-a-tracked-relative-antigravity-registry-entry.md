---
schema: pipeline.backlog-item.v1
id: pipeline.project-uninstall-refuses-a-tracked-relative-antigravity-registry-entry
type: defect
owner: pipeline
status: open
created: 2026-10-22
source: "D79 installer path fix (2026-10-21): the installer now writes a repo-relative path into the tracked .agents/plugins.json; the uninstall observer predates that shape"
sprint: none
done_when: manual
---

# Project uninstall refuses a tracked relative Antigravity registry entry

## Description

Since the D79 installer change, the workspace's tracked `.agents/plugins.json` carries a
repo-relative Pipeline entry (for example `plugins/pipeline-core`) instead of a machine
path. `observeAntigravityWorkspaceBindings` (`lib/antigravity-topology-refresh-host.mjs`)
still builds on `directory()`, which requires an absolute path, so it reports such an
entry as unavailable. `lib/project-uninstall.mjs` (`PU-WORKSPACE-UNVERIFIABLE`) and
`lib/project-uninstall-workspace.mjs` (`PU-WORKSPACE-DRIFT`) then refuse to uninstall a
project that the new installer set up. No existing test covers an uninstall over a
relative entry, which is why the suites are green.

## Acceptance

- A RED case first: uninstall over a workspace whose tracked registry holds the relative
  Pipeline entry.
- The observer classifies a relative entry that resolves inside the workspace to the
  Pipeline source as an owned binding that uninstall removes (and reads back), instead
  of unavailable; a relative entry that resolves elsewhere stays unavailable with a
  runnable repair.
- Whether the real Antigravity host resolves a relative `entries[].path` against the
  workspace is verified on a native host; until then the installer behavior is marked
  unverified.

## Triage

- **Agent work (2026-10-22):** implemented. `observeAntigravityWorkspaceBindings` takes `trackedRelative`
  (uninstall callers only): a repo-relative entry that resolves strictly inside the workspace to a readable plugin
  directory is classified by its manifest name like an absolute one; a relative entry that resolves elsewhere or is
  unreadable stays unavailable, and `PU-WORKSPACE-UNVERIFIABLE` now carries a typed `instructions` repair. The refresh
  paths keep their rule (a tracked entry is never owned or removed). RED-first pins: `UC02C018` to `UC02C020` in
  `plugins/pipeline-core/lib/project-uninstall.test.mjs` (the plan refused with `PU-WORKSPACE-UNVERIFIABLE` before the
  change). The native-host check of the relative `entries[].path` resolution stays open and is not an agent task.
