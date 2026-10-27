# Notes: PF-85 slices 1a/1b (W7-PF85-REPAIR-HINTS-AND-CONTINUATION-C1-20261027)

Status: INTERIM, BLOCKED at the tool-budget checkpoint (call 28 of 35). No patch delivered. Candidate 03a8aa27cb246243d847065280931d1ff4aba64e.
Nothing in the repository tree was edited; all work is in the scratch clone (`scratch/agent-out/w7yy/clone`, `clone2`, driver `scratch/agent-out/w7yy/driver.mjs`, untracked).

## Re-verified recon claims (against the clone at the candidate, `lib/native-goldfish-host-state.mjs`)

- Line 215-218 (admission): CONFIRMED. `fail('NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD')` with `reason` only, no `repair`. Line 216 (readiness not observed) is a different cause and is not given the cancel text.
- Line 752 (reservation publish): CONFIRMED. `throw nativeManagedFault('item-delivery-integration-dependency-held: ...')`, no repair. The catch at line 252 forwards `error.repair` when it is a string, so attaching `repair` to the fault is enough.
- Line 767-780 owner / criterion-owner / scope collisions: CONTRADICTS the recon. They already throw `reservationFault(...)` (line 1617), whose `repair` is `itemReservationRepair(sliceId)` (line 1612): it names `slice-queue.mjs cancel <id> --started --reason ... --class <classes>` plus the class teaching and the Dispatch commit. So the collisions need no code change; only a pin test.
- Line 1099-1103 (queue preparation): CONFIRMED, already teaches cancel and class (pinned by NGHS39, line 1170).
- Line 995-1002 (`orderAndCoverAdmittedSlice` overlap dependency): not re-read in this budget.

## Done

RED case NGHS40 written in the clone's `plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs` (appended after NGHS39, ids ascending): fixture of NGHS07 plus ITEM-D depending on ITEM-A. It asserts (a) the admission refusal of ITEM-D carries a non-empty `repair` naming `slice-queue.mjs cancel`, all five classes and `Dispatch: <slice id> (goldfish)`; (b) the ITEM-B owner collision carries the same. Expected today: part (a) RED, part (b) already GREEN (a pin). The RED run was started (`driver.mjs run red <test file>`, log `scratch/agent-out/w7yy/red.native-goldfish-host-state.test.mjs.log`) but its result was NOT read before the checkpoint: RED is unconfirmed.

## Remaining (next step)

1. Read the RED log; confirm NGHS40 fails on part (a) only. If NGHS07-style fixture reaches line 216 (readiness not observed) instead of 218, adjust the fixture, not the assertion.
2. Implement in the clone: an exported `heldDependencyRepair()` returning the text now inline at line 1103 (cancel command, `cancelClassArg()`, `cancelClassTeaching()`, committed predecessor with its Dispatch trailer); use it at line 218 (`{...fail(...),reason,repair}`), at line 752 (`Object.assign(nativeManagedFault(...),{repair})`) and at line 1103 (behaviour unchanged, NGHS39 still matches).
3. GREEN run, whole test file in clone and clone2 (baseline), compare failing-name sets, `driver.mjs patch`, `driver.mjs check`, then this note completed, `driver.mjs cleanup` (clones still exist).

## 1a (declared continuation): not implemented, po-decision pending

Today every other non-cancelled, non-critic slice with overlapping scope becomes `dependsOn` of the new slice (`orderAndCoverAdmittedSlice`, about line 995-1002, to re-read). A declared continuation needs: (i) a package field carrying the predecessor slice id (new field in the briefing/item-delivery schema and `slice-queue.mjs` row validation: not in the two slice files); (ii) the rule that it is admitted only when the predecessor is cancelled with class `budget` or `wrong-premise`; (iii) the successor recording the predecessor as superseded, not integration-held (`heldDependencyReason` and `dependsOn` consumers). Files: `lib/native-goldfish-host-state.mjs`, `lib/slice-queue.mjs`, the briefing schema, tests. RED: successor naming a budget-cancelled predecessor is admitted without a held dependency; naming a ready predecessor is refused. This is a schema change, so it is not built here.

## Proposed commit message (1b, once complete)

`fix(delivery): name the sanctioned repair in every item-delivery refusal`

## Operator flow (once a patch exists)

apply-diff the held patch, `git add -u -- plugins/pipeline-core/lib/native-goldfish-host-state.mjs plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs`, `--no-verify` commit by the PO ceremony, stamp, install. Protected paths: neither file matches TP-1..TP-13 (agent-obligations section 2). An independent Critic review stays a parent-owned batch gate.
