---
schema: pipeline.backlog-item.v1
id: pipeline.antigravity-rejects-the-claude-model-tiers-in-shared-agent-files
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "PO Antigravity topology refresh on CLI 1.4.2, 2026-10-18"
sprint: none
done_when: manual
---

# Antigravity rejects the Claude model tiers in the shared agent files

## Description

`agy plugin validate` on Antigravity CLI 1.4.2 refuses the plugin's `agents/*.md` with
"Invalid model tier" for `model: sonnet` and `model: haiku`. Claude Code needs exactly those
values in the same files. A global Antigravity install therefore cannot pass validation,
while a workspace-local install runs no CLI validate and works.

The second cause found in the same run, the comma-string `tools:` form, is fixed in
061e208f5 (flow lists). The refresh now validates before it retires the managed copy, so a
refusal no longer leaves the PO without the plugin.

## Triggering situation

Global Antigravity topology refresh on CLI 1.4.2 with the 0.7.0 Alfred candidate.

## Proposal

Establish which model values Antigravity 1.4.2 admits, then choose one route:

- a runner-specific agent copy generated at install time for Antigravity;
- or a frontmatter value both runners accept.

## Acceptance

- A global Antigravity install on CLI 1.4.2 validates and installs.
- The Claude Code agent files keep their model pins (MP-29).
