---
schema: pipeline.backlog-item.v1
id: pipeline.git-hook-runtime-snapshots-go-stale-after-plugin-changes
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Live observation, Claude Code session on native Windows, 2026-10-04, feat/sprint-alfred, lifecycle implementing (first commits after set-phase)."
sprint: alfred
done_when: manual
---

# Git hook runtime snapshots go stale after plugin changes, and a read from the installed plugin is refused as a cross-repo write

## Description

**Stale hook snapshots.** The commit-msg and pre-commit hooks do not run the
installed plugin. Their installers copy a runtime snapshot of the plugin
(`lib/`, `hooks/`, `scripts/`) into `.git/agent-pipeline/<hook>/runtime-<sha>/`
and the hook imports only that snapshot. After operator hotfixes were applied
to the installed plugin, the snapshot still carried the pre-hotfix
`lib/design-advisor-course-store.mjs` (sha256 equal to the unpatched source).
In `implementing`, every staged path, including `backlog/items/*`, was then
refused at commit time with `GUARD-DEVPLAN-LIFECYCLE`, while the PreToolUse
guard (running the installed, hotfixed plugin) admitted the same writes. Two
copies of the same policy disagreed. Nothing reported the drift; the
installers' `--plan-install` only showed `ready-to-upgrade` when asked. The
upgrade (`--install`) is a PO act, because it rewrites Git hooks.

**Cross-repo misclassification.** `cp <installed plugin>/hooks/x.mjs
plugins/pipeline-core/hooks/x.mjs` was refused with
`GUARD-CROSS-REPO-MUTATION`, although the installed path is only the read
source and the write target is inside the project root.

## Triggering situation

First Goldfish commits after `set-phase --phase implementation` (W0-0 and the
W0-3a hotfix port), 2026-10-04.

## Affected artifact

`plugins/pipeline-core/scripts/commit-msg-hook-install.mjs`,
`plugins/pipeline-core/scripts/pre-commit-hook-install.mjs` (snapshot
lifecycle); the shell write-target extraction in
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (cp source operand).

## Proposal

- Bind each hook snapshot to the installed plugin identity and report a
  typed `HOOK-SNAPSHOT-STALE` diagnostic in preflight and in the commit
  refusal, naming the one refresh command. Refresh snapshots as part of the
  sanctioned plugin install/refresh flow, so a PO plugin update never leaves
  stale hooks behind.
- Classify only the destination operand of `cp`/`mv`/`install` as the write
  target; a source outside the root is a read (subject to the read policy).
- Fixtures on win32 and POSIX, consumer layout included.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
