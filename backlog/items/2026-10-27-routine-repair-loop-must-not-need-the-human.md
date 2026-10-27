---
schema: pipeline.backlog-item.v1
id: pipeline.routine-repair-loop-must-not-need-the-human
type: defect
owner: pipeline
status: open
created: 2026-10-27
priority: P1
release: 0.7.0
sprint: alfred
source: "PO direction 2026-10-27: routine repairs run without asking and are only reported, as a rule for every user repository; the frequency of the repair loops must stop"
done_when: manual
---

# The routine repair loop must not need the human, and must stop recurring

## Evidence

On 2026-10-27 one Elephant session spent most of its dispatches in the same loop: a Goldfish stops short, a stop-failure
record or an unindexed registry entry blocks `heal`, the PO is asked for an exception, the Elephant moves a file aside,
runs `heal`, cancels the slice, and starts a continuation. Three PO decision tiles were spent on it in one afternoon, and
the PO reports that the other repositories are in repair loops as well. The Elephant's own rule (EL-37: a protected
mutation goes only through its sanctioned route) was applied correctly each time, which is why each step needed a
human even though the step is the tool's own offered repair.

## Wanted

1. A closed list of routine repairs the Elephant runs without a PO tile and reports afterwards: `heal`;
   `slice-queue cancel` with class `budget` or `integrated-elsewhere`; move a finalizer stop-failure record aside;
   `move-aside --no-goldfish-running` for exactly `unknown-registry-entry` and `native-managed-unknown-native-entry`
   when no Goldfish runs. Each is retained aside, never deleted, and recorded.
2. The same list is the default calibration for every user repository (`pipeline.user.yaml` or the plugin default), with
   unknown findings, deleting repairs and any write to a project repository outside the list still decided by the human.
3. The routes above become sanctioned verbs that carry their own admission (a `repair` verb with the closed list), so the
   Elephant does not need a PO exception for a plain `mv` into the native directory.
4. The frequency falls: the root causes are fixed rather than repaired each time (the stop-failure classifier, `heal`
   retiring diagnostics and dead locks, a `checkpoint` outcome instead of a failed stop, a complete host commit for a
   background dispatch). Measure: repair steps per delivered slice, reported in the session close.
5. Regression: each listed repair, run by the Elephant under the default calibration, is admitted and recorded; a finding
   outside the list is refused with the typed next step.

6. RUNNER-NEUTRAL (PO 2026-10-27): the closed repair list, the `repair` verb, the default calibration and the repair
   measure live in the runner-neutral core and apply identically to all three runners (Claude, Codex, Antigravity).
   Runner adapters only translate; none may carry its own list. Regression: one shared test table runs the same repairs
   through each adapter. A runner that cannot enforce a part says so in a typed readback instead of silently skipping it.

## Boundaries

The PO decision of 2026-10-27 (tile answer) is the authority for this session; this item makes it durable and
repository-wide. Related: `2026-10-27-budget-exhaustion-is-a-checkpoint-the-elephant-answers-not-a-failed-stop.md`,
`2026-10-27-a-stop-failure-diagnostic-makes-the-native-goldfish-inventory-unreadable.md`.
