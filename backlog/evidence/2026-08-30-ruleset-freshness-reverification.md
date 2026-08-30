# Ruleset-freshness re-verification — 2026-08-30

## Correction of the retirement classification

`pipeline.ruleset-freshness-wsl-subsystem-absent` was included with the two
Sentinel baseline records in an initial retirement note because it was one of
the three remaining `in_progress` records without a current sprint assignment.
That classification was wrong: it is a Phoenix-origin Codex-on-WSL freshness
defect, not a Sentinel baseline.

The PO's direction still requires that old, unbounded in-progress records do
not remain open indefinitely. This item is closed because its actual technical
claim is now verified in current code, not because Sentinel is retired.

## Current-code evidence

At candidate `17e888271eaed3f0d54575d301663e060d4432c2`:

- `node plugins/pipeline-core/scripts/ruleset-freshness.test.mjs` passed
  16/16, including the Codex+WSL `host-authorized-wsl` case: network-delegated
  `ls-remote` is prevented from reaching the local spawn substitute, while the
  non-WSL/local path still performs the normal local observation.
- `node plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs`
  passed 54/54, including selection only for Codex on WSL (never Claude), the
  digest-bound `freshnessHostActionForPreflight()` readback, and the current
  populated `rulesetSource` binding.

The current `ruleset-freshness.mjs` and `pipeline-start-preflight.mjs` thus
provide the host-boundary mechanism whose absence the item originally
described. A future freshness or host-transport defect must be filed as a new
item against that current design rather than reviving this historic
merge-recovery record.
