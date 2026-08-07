---
schema: pipeline.backlog-item.v1
id: pipeline.ruleset-freshness-wsl-subsystem-absent
type: defect
owner: pipeline
status: open
source: merge report section 4 finding 10 (specs/sprint-phoenix-epic/evidence/merge-0.5.2-what-fell-away.md gitignored evidence artifact); merge commit 75b8361
created: 2026-08-07
---

# The WSL host-authorized freshness/self-application-comparison subsystem is gone

## Description

The 0.5.2 merge (`75b8361`, local only) resolved
`plugins/pipeline-core/scripts/ruleset-freshness.mjs` to main's version.
Main took this file in an unrelated direction (introducing
`PIPELINE_UPDATE_AVAILABILITY_SCHEMA`), which does not carry forward
Phoenix's WSL host-authorized freshness/self-application-comparison
subsystem — the mechanism that compared this checkout's ruleset against the
public marketplace remote under the `host-authorized-wsl` execution
boundary.

## Triggering situation

Merge conflict resolution, code-conflict batch (28 files, origin/main taken
verbatim per PO's same-function policy).

## Affected artifact

`plugins/pipeline-core/scripts/ruleset-freshness.mjs`, and any bootstrap
step that previously depended on its WSL-specific freshness comparison
(session-bootstrap.md's freshness check, per CLAUDE.md's session bootstrap
step 2).

## Proposal

No proposal yet. Needs assessment of what main's
`PIPELINE_UPDATE_AVAILABILITY_SCHEMA` direction actually covers before
deciding whether this is a real functional gap for WSL-hosted sessions or
whether main's replacement serves the same purpose differently.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
