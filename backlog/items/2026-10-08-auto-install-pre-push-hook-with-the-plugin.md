---
schema: pipeline.backlog-item.v1
id: pipeline.auto-install-pre-push-hook-with-the-plugin
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-08
source: "admin-step inventory (docs/admin-steps-inventory.md), decision AO"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# Auto-install the pre-push hook with the plugin

## Description

Admin-step inventory row C3 ("Install `pre-push` hook: `pre-push-hook-install.mjs --install`", per host, PO terminal)
is classified automatable: install it with the plugin or during clone provisioning instead of a hand-run command.
Source: `docs/admin-steps-inventory.md` row C3, candidate 1; toil T4 (toil log:10);
`plugins/pipeline-core/scripts/pre-push-hook-install.mjs:800`.

## Triggering situation

Toil row T4 (toil log:10): the PO runs the pre-push hook installer by hand on every host. Decision AO makes
automatable admin steps backlog items.

## Affected artifact

`plugins/pipeline-core/scripts/pre-push-hook-install.mjs`, the plugin install path and clone provisioning.

## Proposal

Provision the pre-push hook during plugin install or clone provisioning so a fresh host needs no manual command.
Owner: pipeline; due 2026-10-31.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** decision AO: automatable admin step.
- **Assignment (if accepted):** post-0.7.0 automation lane unless pulled in.
- **Date:** 2026-10-08
