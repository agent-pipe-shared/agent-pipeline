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

- **Decision:** needs-verification (2026-10-08); premise refuted on verification (2026-10-22), disposition below.
- **Rationale:** decision AO: automatable admin step.
- **Assignment (if accepted):** post-0.7.0 automation lane unless pulled in.
- **Date:** 2026-10-08

## Verification of the premise (agent, 2026-10-22)

Premise refuted on two independent grounds, pinned in `plugins/pipeline-core/lib/pins/codex-bootstrap-in-the-typed-next-action.test.mjs`:

1. The script is not a host setup step. `codex-design-readiness-bootstrap.mjs` is a per-design-package readiness producer: its
   usage needs `--repo-root`, `--dispatch-id`, `--queue-revision`, `--session-id`, `--expected-descriptor-sha256`, `--receipt`,
   five `--source` entries and an advisor preparation. A fresh host has none of these, so there is no fresh-host action to fold it into.
2. ADR-0085 retired the design course behaviorally. `runCodexDesignReadinessBootstrap` returns `DESIGN-COURSE-RETIRED` before
   parsing, state access, dispatch or publication, and `runDesignCourseV2` returns the same retirement. Nothing runs, so nothing
   needs automating.

The deferral pin is retargeted to this state (it still fails if the preflight starts naming the script). Recommended disposition for the
Elephant triage: close as obsolete (premise refuted, route retired). The inventory row `docs/admin-steps-inventory.md` line 54 and
candidate 6 still describe the step as automatable and are stale; correcting them was left to the triage because the inventory
carries row counts.
