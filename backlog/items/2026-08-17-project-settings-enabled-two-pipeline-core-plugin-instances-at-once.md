---
schema: pipeline.backlog-item.v1
id: pipeline.project-settings-enabled-two-pipeline-core-plugin-instances-at-once
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "Caught live by the PO while verifying the 0.5.5 toolbox-refresh candidate: `/reload-plugins` in this repository's own dev session reported \"Reloaded: 2 plugins\" instead of 1."
---

# This repository's own tracked project settings enabled a stale GitHub-sourced `pipeline-core` alongside the local-development one

## Description

`.claude/settings.json` (tracked, project-scope) declared
`enabledPlugins: { "pipeline-core@agent-pipeline": true }` — the
GitHub-sourced marketplace snapshot, stuck at `0.5.4`. Separately, this
machine's global `~/.claude/settings.json` (user-scope, not tracked)
declared `enabledPlugins: { "pipeline-core@agent-pipeline-local": true }`
— the local-development marketplace this repo's own AFK session actively
rsyncs fresh candidates into. Claude Code merges `enabledPlugins` across
scopes additively rather than letting one scope override the other, so
this repository's own dev sessions were running **two full `pipeline-core`
plugin instances at once**: the fresh local candidate and a stale external
snapshot roughly 13 candidate-versions behind.

## Triggering situation

Visible as `/reload-plugins` reporting "Reloaded: 2 plugins" (expected: 1)
and roughly double the expected hook count (26 instead of ~13). The PO
noticed the "2 plugins" wording and asked for it to be verified; the two
independently-enabled scopes were confirmed by reading
`.claude/settings.json`, `.claude/settings.local.json`, and the global
`~/.claude/settings.json` side by side.

## Affected artifact

`.claude/settings.json` (this repository, tracked) and
`.claude/settings.local.json` (this repository, untracked, local-only).

## Proposal

Point this project's own tracked `enabledPlugins` at
`pipeline-core@agent-pipeline-local` instead of
`pipeline-core@agent-pipeline`, so a session opened in this repository
consistently exercises the same local candidate the PO tests downstream,
with no duplicate plugin load. The local marketplace's directory `source`
itself stays out of the tracked `extraKnownMarketplaces` block — it is a
machine-specific absolute path (CLAUDE.md: no machine-specific absolute
paths in commits; this repo runs on two machines with different local
paths) and is already registered per-machine in each machine's own global
settings.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — fixed live in the same turn it was reported
  (commit `917f8a1e`), no dedicated dispatch needed: a one-line
  `enabledPlugins` value change with no behavioural ambiguity. Not yet
  closed: MP-07 classifies `permissions/settings` as guardrail-class, so
  this fix still needs its mandatory Critic review (self-application,
  ADR-0015) before being folded into the next candidate stamp, same as
  any other guardrail diff. Close this item once that review passes.
- **Rationale:** self-application governance (ADR-0015) applies to this
  repo's own tooling config the same as to any other guardrail-adjacent
  file.
- **Assignment (if accepted):** this AFK block.
- **Date:** 2026-08-17
