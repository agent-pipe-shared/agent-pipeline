---
schema: pipeline.backlog-item.v1
id: pipeline.machine-wide-key-directory-resolution
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-08
source: "admin-step inventory (docs/admin-steps-inventory.md), decision AO"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# Machine-wide key directory resolution

## Description

Admin-step inventory row C6 ("Make the key directory known to the tool", via `PIPELINE_PO_APPROVAL_DIRECTORY` or
`--directory`, per host, PO terminal) is classified automatable: resolve the key directory machine-wide and offer a
typed setup action. Source: `docs/admin-steps-inventory.md` row C6, candidate 2; `docs/push-release-flow.md:218-227`;
toil log:20 (T14).

## Triggering situation

Toil row T14 (toil log:20): the PO has to tell the tool where the signing key directory lives on each host.

## Affected artifact

The PO approval/key-directory resolution in `plugins/pipeline-core` and the `poKeyDirectory` setting.

## Proposal

Resolve `poKeyDirectory` once per machine and offer a typed setup action when it is absent.
Owner: pipeline; due 2026-10-31.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** decision AO: automatable admin step.
- **Assignment (if accepted):** post-0.7.0 automation lane unless pulled in.
- **Date:** 2026-10-08
