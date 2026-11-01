# Held patch notes — the local plugin doc names the project hook refresh after an update (candidate 15c)

Patch: `w28-local-plugin-doc-names-the-project-hook-refresh-after-an-update.patch`. Documentation only, one file (`docs/claude-local-plugin-development.md`), independent of the other 15c patches. Item 6 (second half) of `pipeline.candidate11-follow-ups`, from a consumer report: the install hint did not say that a hook refresh is required after an install or update.

## What

A short paragraph in the refresh section: after an install or update that changes a mandatory hook, a project that already uses the Pipeline needs its own hook wiring refreshed. `pipeline-start` reports it as `hook-refresh-required` (or `hook-provisioning-required` for a project without the hooks) and returns the exact action; run it once from the Elephant session and rerun the preflight. A guard that still refuses a newly admitted command or directory after an update usually means this step is missing.

## Evidence

- The statuses and actions are those of the `pipeline-start` skill; nothing new is claimed.
- Doc-contract suite 76/76.

## Not covered

- The install output itself (a hint printed by a command) is unchanged; this is the document a consumer reads. The first half of item 6 (the native Glob refusing the calibration directory) needs the consumer's exact denial text and a listing; it stays open.
