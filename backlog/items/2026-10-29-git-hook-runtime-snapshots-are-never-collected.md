---
schema: pipeline.backlog-item.v1
id: pipeline.git-hook-runtime-snapshots-are-never-collected
type: defect
owner: pipeline
status: open
created: 2026-10-29
priority: P1
release: 0.7.0
sprint: alfred
source: "PO observation 2026-10-29 (chat): a background dispatch spent 13 minutes in 'running PreToolUse hooks 3/4'; PO suspected an oversized state file and asked for a cleanup job"
done_when: manual
---

# Git-hook runtime snapshots are never collected

## Evidence

Measured 2026-10-29 in the working clone: `.git/agent-pipeline` holds about 2.5 GB. About 2.3 GB of it is three directories, `pre-commit-hook`, `commit-msg-hook` and `pre-push-hook`, each about 770 MB, each holding about 300 `runtime-<sha256>` snapshot directories (25 of them created in the last two days, one per stamp or install). Everything else under `.git/agent-pipeline` is small: `session-authority-abandoned` 89 MB, `verify/runs` 92 MB, `signed-quality-packages` 27 MB, `human-guard-overrides` 9 MB, the dispatch registries (`dispatch-budget`, `dispatch-slicing`, `native-slicing`, `run`) a few MB each.

No retention rule collects a snapshot that no installed hook refers to any more. Whether the snapshot size causes the 13-minute PreToolUse stall is NOT established: no hook was timed. The stall may equally come from the dispatch registry scan (the generator reports about 70 earlier dispatches whose write scope "could not be read") or from dead registry locks of earlier dispatches. The first slice must measure, not clean.

## Proposal

1. **Measure first.** Time each of the four PreToolUse hooks of the Agent tool on a dispatch call (a `--trace` or a timing wrapper in `guard-lifecycle-ready` and `guard-dispatch*`) and report milliseconds per hook plus the directories each one reads. Decide the fix from the numbers.
2. **A cleanup command, never an automatic delete in a guard.** `node plugins/pipeline-core/scripts/runtime-gc.mjs plan` lists snapshots unreferenced by the three installed hook files and by any live reservation, `apply --plan-sha256` removes exactly that plan, keeps the newest N (default 5) per hook directory and every snapshot referenced by a retained dispatch record. Plan and apply follow the repair-command pattern (digest-bound, nothing deleted at plan time).
3. **Retention at write time.** The installer that creates a snapshot prunes beyond N after the new one verifies.
4. **Same pass for the other growers:** `session-authority-abandoned` and `verify/runs` get an age-based plan line; the dead dispatch reservations and the stale `stop-failure-*` diagnostics (about 20 listed in every briefing build) get a plan line too.

## Acceptance

- The per-hook timing for a dispatch call is recorded in the item with before and after numbers.
- `runtime-gc.mjs plan` on this clone reports the unreferenced snapshots without deleting; `apply` frees them; a second plan is empty.
- A pin test: a snapshot referenced by an installed hook or a live reservation is never in the plan.
