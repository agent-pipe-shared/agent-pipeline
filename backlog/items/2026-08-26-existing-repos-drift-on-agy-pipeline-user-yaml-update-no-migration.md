---
schema: pipeline.backlog-item.v1
id: pipeline.existing-repos-drift-on-agy-pipeline-user-yaml-update-no-migration
type: defect
owner: pipeline
status: open
created: 2026-08-26
sprint: nightwing
done_when: manual
source: "PO observation (chat), 2026-08-26: updating a consumer repo onto the sprint_agy ruleset changes pipeline.user.yaml's expected shape; an already-onboarded repository that does not also update its own pipeline.user.yaml drifts and the pipeline breaks with no repair path."
---

# Updating to the Agy runner ruleset drifts an existing repo's `pipeline.user.yaml` with no automatic repair

## Description

This session's Agy work (chat-gate-ceremony standardization, per-repository
push-approval-mode confirmation pre-filled from the machine default, the
Antigravity third-runner integration, and related `pipeline.user.yaml`
schema/field changes) assumes a repository picking up the new ruleset is
either freshly onboarded or willing to re-run onboarding. A repository that
was already onboarded under an OLDER ruleset and simply updates its
installed Pipeline plugin/ruleset to the Agy version does not get its
`pipeline.user.yaml` (or other calibration artifacts the update now expects)
migrated automatically — the PO's own observation is that this leaves the
pipeline defect ("drifted") and broken for that repository with no
repair path.

This is a real adoption blocker for any existing, already-onboarded
project repository picking up this branch's changes, not just a
theoretical gap: the Agy work changes what a governed repository's
`pipeline.user.yaml` is expected to contain, and nothing currently
detects "this repo's calibration predates the schema this ruleset now
expects" and offers a guided or automatic fix.

## What's needed

An automatic (or at minimum guided, detected-and-prompted) migration path
for an existing/bestehendes repository's `pipeline.user.yaml` (and any
other calibration artifacts affected) when it updates onto a ruleset
version that expects a newer shape — analogous to how onboarding itself
already asks/derives values, but triggered by a ruleset-version bump on an
already-onboarded repo rather than only at first-time onboarding. Exact
scope (which fields, how staleness is detected, whether it is silent-
migrate vs. detect-and-block-with-a-fix-command) is undesigned — this item
records the gap, not a solution.

## Triage

- **Decision:** open, unassigned. Real adoption blocker for existing
  repositories, worth prioritizing before this ruleset version is rolled
  out more broadly beyond this repo's own self-application.
