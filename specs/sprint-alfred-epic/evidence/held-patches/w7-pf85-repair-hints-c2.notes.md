# Notes: PF-85 slice 1b (W7-PF85-REPAIR-HINTS-C2-C1-20261027)

Status: targeted delivery green. Candidate 56f2b265db7f1f00cb648bfe38199cb5932d5284. Held patch: `w7-pf85-repair-hints-c2.patch` (9811 bytes, two files). Nothing in the repository tree was edited; all work was in scratch clones (deleted at close).

## Cause

Two item-delivery refusals named no repair: admission `NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD` (`lib/native-goldfish-host-state.mjs` about line 218, reason only) and the reservation-publish throw (about line 752, `nativeManagedFault` without repair; the catch at about line 252 forwards a string `error.repair`). Owner, criterion-owner and scope collisions already carry `itemReservationRepair` through `reservationFault`: unchanged, pinned only. The readiness-not-observed branch (line 216) is a different cause and is deliberately left unchanged.

## Changed lines

- `native-goldfish-host-state.mjs`: new exported `heldDependencyRepair()` (text moved from the inline repair of the queue-preparation refusal); used at admission (adds `repair:` to the line-218 return), at the reservation-publish throw (`Object.assign(nativeManagedFault(...),{repair:heldDependencyRepair()})`) and at the queue-preparation refusal (text unchanged, NGHS39 still matches).
- `native-goldfish-host-state.test.mjs`: new case NGHS40 appended after NGHS39 (fixture of NGHS07 plus ITEM-D depending on ITEM-A).

## Evidence

- RED (clone, unchanged code): log `scratch/agent-out/w7yz/red.native-goldfish-host-state.test.mjs.log`: tests 45, pass 44, fail 1 = NGHS40, failing at "held-dependency admission: a non-empty repair is present" (owner-collision pin and the held-branch-not-readiness assertions had already passed).
- GREEN (clone, patched, whole file): `green.native-goldfish-host-state.test.mjs.log`: tests 45, pass 45, fail 0; NGHS39 and NGHS40 both pass.
- Baseline (clone2, unchanged, whole file): `base...log`: tests 44, pass 44, fail 0.
- Failing-name sets: baseline empty, patched empty; the only difference is the added NGHS40. No pre-existing failure.
- Apply check: `git apply --check` in clone2 at the candidate, exit 0.

## Not done / limits

- The reservation-publish throw (line 752) is reachable only on an admission race, so NGHS40 pins it at the source (regex: the throw attaches `heldDependencyRepair()`) plus the exported function text, not by a behavioural run. A behavioural test would need a race fixture.
- Slice 1a (declared continuation) is not implemented: it needs a package schema field and is PO-decision pending.
- Full Verify, batch Critic review and PO acceptance remain parent-owned and pending.

## Proposed commit message

`fix(delivery): name the sanctioned repair in every item-delivery refusal`

## Operator flow

apply-diff the patch, `git add -u -- plugins/pipeline-core/lib/native-goldfish-host-state.mjs plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs`, `--no-verify` commit by the PO ceremony, stamp, install. Protected paths: neither file matches TP-1..TP-13 (agent-obligations section 2), observed. Note the patch touches `native-goldfish-host-state.mjs`, which is outside this dispatch's write scope list but is named in the briefing's "files that may differ in the patch"; it travels only inside the patch.
