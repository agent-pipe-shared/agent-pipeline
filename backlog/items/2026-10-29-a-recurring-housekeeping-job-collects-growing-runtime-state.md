---
schema: pipeline.backlog-item.v1
id: pipeline.a-recurring-housekeeping-job-collects-growing-runtime-state
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-29
priority: P2
release: 0.7.1
sprint: none
source: "PO direction 2026-10-29 (chat): after moving about 2.3 GB of unused git-hook runtime snapshots aside by hand, the PO wants a regular housekeeping job for this and for comparable growing state, not only for the snapshots"
done_when: manual
---

# A recurring housekeeping job collects growing runtime state

## Evidence

On 2026-10-29 `.git/agent-pipeline` held 2.5 GB, of which about 2.3 GB were roughly 300 unreferenced `runtime-<sha256>` snapshots in each of the three git-hook directories. The PO moved everything except the snapshot named by each hook's `impl.mjs` into a directory outside the repository; the state fell to about 300 MB and every hook kept working. Nothing in the Pipeline would have done this: every stamp or install adds a snapshot and no rule removes one. The specific item `2026-10-29-git-hook-runtime-snapshots-are-never-collected` covers the snapshots and the question whether they slow the PreToolUse hooks.

Other state in the same tree grows the same way and has no retention rule either (sizes measured the same day): `session-authority-abandoned` about 89 MB, `verify/runs` about 92 MB, `signed-quality-packages` about 27 MB, `claude-task-output-read-scope` about 2.4 MB, `dispatch-budget` and `run` a few MB, plus the `stop-failure-*` host diagnostics (about 20 listed in every generated briefing), dead dispatch reservations and dead registry locks, `scratch/clones` worker clones and `scratch/agent-out` clones of held-patch work, and `~/pipeline-test-tmp` worker directories.

## Proposal

1. **One housekeeping command, one registry of collectors.** `scripts/housekeeping.mjs plan|apply --plan-sha256` with a small registry; every collector declares what it owns, how it decides a thing is unreferenced, a retention rule (newest N, age, or referenced-by), and its measured size. Plan lists what each collector would move; apply moves exactly that plan, digest-bound, and never deletes at first: items go to a named aside directory outside the repository with a manifest, and a second step (`purge --older-than`) removes aside items after a grace period.
2. **First collectors:** hook runtime snapshots (live one read from each `impl.mjs`, newest N kept), abandoned session-authority records, old Verify runs, stale `stop-failure-*` diagnostics, dead reservations/locks (via the existing repair verbs, not by hand), worker clones older than N days, test temp directories.
3. **Recurring, and visible.** The bootstrap preflight prints one line when the state exceeds a size or count threshold (for example more than 1 GB or 50 snapshots) and names the plan command; an optional scheduled run (cron or a runner routine) executes `plan` only and reports. Apply stays an explicit act of the Elephant or the PO; a collector never runs inside a guard or a hook.
4. **Safety rules:** never touch anything referenced by an installed hook, a live reservation, a retained dispatch record or a retained Critic course; never run while a HEAD- or tree-bound PO command is outstanding; every collector has a pin test that the referenced item is never in the plan.
5. **Measure first** (shared with the snapshot item): time the four PreToolUse hooks of an Agent dispatch before and after, so the job's value is a number and not an assumption.

## Acceptance

- `housekeeping.mjs plan` on a clone like this one lists each collector with count and bytes and changes nothing; `apply` frees them and a second `plan` is empty.
- The preflight line appears above the threshold and is absent below it.
- Each collector's pin test proves a referenced item is never planned.
- The snapshot item `2026-10-29-git-hook-runtime-snapshots-are-never-collected` is closed by the first collector of this job.
