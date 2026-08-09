# Freshness, calibration and handover (lazy)

Repository freshness and Pipeline update availability are separate channels;
consumer projects default to `stable`, self-repository may explicitly select
`alpha`, and `--channel beta` requires its own digest-bound plan/apply gate.
Read calibration/denies, handover/state and Verify availability fully; report
unknown/unavailable honestly. A stale candidate, drifted authority, malformed
handover or unavailable Verify blocks confirmation. For a registered local
development source print, in addition to the start line:
`Agent Pipeline source: local-development · registered local marketplace`.

## Calibration and denies (existence check FIRST)

Check that the calibration file EXISTS at its resolved authority tier
(`project/pipeline.json`, else the legacy `.claude/pipeline.json`), then read it
completely. Required minimum fields: verify command(s), autonomy level, branch
model, worktree rule, stakes rating, project constraints; keys starting with `$`
are documentation. Project denies do not live in that file: check the committed
`.claude/settings.json` permissions and the git-guard config for the deny
surface a project declares. A missing file or a missing required field is case
**F4**. Critic reads only the guardrail/constraint parts, as its review standard.

## Handover/state file

Read the project's handover file completely (path from the calibration, default
`docs/state.md`). It is the sole authoritative state source; memory is only a
mirror. Extract its last-update date for the confirmation line. Drift warning
(default threshold): the repository's last commit is NEWER than the handover
state AND the delta since then contains at least one non-docs commit — a
docs-only delta does not warn. A project may override this through the
`$driftThreshold` comment field in its calibration; the default applies when the
field is absent. Goldfish and Critic do not read this file at all
→ `references/roles.md`.

## Operator update reminder

When the update check reports `updateRecommended:true`, or a native marketplace
update notification appeared in this session, notify the PO and name the
runner's explicit operator boundary BEFORE the confirmation line: Claude uses
its marketplace/plugin update plus `/reload-plugins`; Codex uses `/plugins`,
then `/new`. The helper itself never updates, restarts, retargets, checks out,
rebases, merges or copies source; ordinary update availability stays advisory
and only an exact security-policy match blocks. If neither trigger applies, this
step is skipped outright.

## Defined additions to the confirmation line

Only these, each appended with "·":

- F3 (offline / remote unreachable): `· Staleness unchecked (offline, cache state)`
- advisory update: `· NOTE: Pipeline update available (operator action recommended)`
- same-day short bootstrap: `· Staleness same-day cached (full check {{HH:MM}})`
- speed profile: `· Profile speed — light bootstrap (details → §6.5)`
- F4 (calibration and/or handover missing — the EXPECTED initial state of a
  not-yet-migrated project): the affected field carries `MISSING (F4)` instead
  of a placeholder, i.e. `Calibration MISSING (F4)` resp. `State MISSING (F4)`,
  PLUS the mandatory suffix
  `· F4: read-only analysis only until calibration/handover is created`.
