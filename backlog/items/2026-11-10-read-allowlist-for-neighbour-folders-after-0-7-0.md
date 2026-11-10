---
schema: pipeline.backlog-item.v1
id: pipeline.read-allowlist-for-neighbour-folders
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-10
source: Claude greenfield report 070_6 (F-READONLY-WIN) and the PO tile of 2026-11-10 placing it after 0.7.0
sprint: alfred
done_when: manual
---

# Read allowlist for neighbour folders and script path arguments

## Description

A greenfield run on native Windows needed to read a folder next to its project on the PO's order, and the guard refused the read. A project script could still read outside the project, because script path arguments are not checked. The PO deferred both by tile on 2026-11-10.

## Scope

- A narrow, user-configured allowlist of read-only folders outside the project root, with the same secret-name screen the project lane uses.
- A check of path arguments passed to scripts, or a stated limit that says why it cannot be checked.
- The real closure of the observation boundary is OS isolation. This item does not replace it and must not claim to.

## Done when

The PO accepts the allowlist behaviour on Windows and Linux, and the guard text names the configured route.
