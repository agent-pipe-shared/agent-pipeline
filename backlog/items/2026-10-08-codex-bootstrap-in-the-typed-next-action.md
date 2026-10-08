---
schema: pipeline.backlog-item.v1
id: pipeline.codex-bootstrap-in-the-typed-next-action
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-08
source: "admin-step inventory (docs/admin-steps-inventory.md), decision AO"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# Codex bootstrap in the typed next action

## Description

The admin-step inventory row "Run Codex design-readiness bootstrap script on a fresh host" (per host, PO terminal) is
marked automatable: fold it into the bootstrap typed next action for a fresh host. The inventory marks the premise
unverified: the row has no toil row and cites only the existing script
(`plugins/pipeline-core/scripts/codex-design-readiness-bootstrap.mjs`), so the manual step itself is not evidenced
as recurring toil. Source: `docs/admin-steps-inventory.md` Codex row (line 54), candidate 6.

## Triggering situation

None measured: no toil row exists for this step. The premise (that a PO hand-runs this script on fresh hosts) needs
verification before work starts.

## Affected artifact

`plugins/pipeline-core/scripts/codex-design-readiness-bootstrap.mjs` and the bootstrap typed next action.

## Proposal

After verifying the premise, include the design-readiness bootstrap in the fresh-host typed action.
Owner: pipeline; due 2026-10-31.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** needs-verification.
- **Rationale:** decision AO: automatable admin step.
- **Assignment (if accepted):** post-0.7.0 automation lane unless pulled in.
- **Date:** 2026-10-08
