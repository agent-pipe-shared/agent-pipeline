# Notes: PF-85 slice 1a (W7-PF85-CONTINUATION-OF-C1-20261027)

Status: INTERIM CHECKPOINT at the tool-budget checkpoint (call 32 of 40). NO PATCH delivered. Candidate a915bef47808bc415281171490bb33350af773be.
Nothing under plugins/ in the repository was edited. All work is in the scratch clone (`scratch/agent-out/w7ca/clone`, `clone2` at the candidate, driver `scratch/agent-out/w7ca/driver.mjs`, untracked; modes setup | run LABEL files | patch | check | cleanup). The clones still exist (cleanup not run).

## Re-verified facts (against the clone at the candidate)

- `orderAndCoverAdmittedSlice` (native-goldfish-host-state.mjs line 1004-1011) skips `other.state==='cancelled'`: CONFIRMED, a cancelled predecessor never becomes `dependsOn`.
- `validateItemDeliveryBriefing` (native-goldfish-host-return.mjs line 171-185) is closed via `exact(value,['schema','sliceId','itemId','criterionLocator','checks'])`: CONFIRMED. `ID` regex is line 23.
- `slice-queue.mjs` stores the class: CONFIRMED, `SLICE_KEYS` line 119 includes `cancelClass`; the normalized row carries `cancelClass` (line 682; `unclassified` for a pre-D75 row). No STOP needed for the class.
- Admission places: `prepareGovernedItemQueue` line 1033-1112 (new row pushed at line 1102, `orderAndCoverAdmittedSlice` at 1103, held-dependency refusal at 1111) and `prepareNativeGoldfishHostState` admission line 213-221.
- CONTRADICTION with the older recon note: 1b is already in the candidate (`heldDependencyRepair()` exists, line 54; NGHS44 pins it). The older note's "Remaining" list for 1b is stale.

## Done

RED cases written in the CLONE only (`plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs`, appended after NGHS51, ids ascending):
- NGHS52: queue-level. Ready predecessor refused; unknown id refused; budget-cancelled admitted and recorded (`row.continuationOf`, `dependsOn` empty, `validateSliceQueue` ok and normalized row carries the field); wrong-premise-cancelled admitted; review-defect-cancelled refused; no field leaves the row without the key. Every refusal asserts code NGHS-ITEM-CONTINUATION-PREDECESSOR-INVALID, a reason naming the failed condition, a repair matching `slice-queue.mjs cancel <slice id> --class budget` and `regenerate the binding`, and a byte-identical queue file.
- NGHS53: `validateItemDeliveryBriefing` accepts no field and a safe id; refuses 7, '', null, array, object, 'has space', '../x', a 200-char string and true with NGHR-ITEM-DELIVERY-SHAPE.
RED run was started in the background (`driver.mjs run red plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs`, log `scratch/agent-out/w7ca/red.native-goldfish-host-state.test.mjs.log`); its result was NOT read: RED is unconfirmed. The test edits exist only in the clone, so the repository test file is unchanged and the write-scope list in the report is notes only.

## Remaining (exact implementation plan, nothing written yet)

1. native-goldfish-host-return.mjs line 173: allow the optional key: compute `keys` as the five names plus `continuationOf` when `Object.hasOwn(value,'continuationOf')`; require `typeof value.continuationOf==='string'&&ID.test(value.continuationOf)`. Absent field: byte-identical behaviour.
2. slice-queue.mjs: add `"continuationOf"` to `SLICE_KEYS` (line 119); validate it with `isSliceId` (err SQ-SCHEMA otherwise, and not equal to the row's own id); put `...(raw.continuationOf!==undefined?{continuationOf:raw.continuationOf}:{})` in the normalized entry (line 676); optionally surface it in the summary (line 950-958).
3. native-goldfish-host-state.mjs: export `continuationPredecessorRefusal(continuationOf,sliceId,slices)` returning null when the named slice exists, is not the slice itself, has `state==='cancelled'` and `cancelClass` in {budget, wrong-premise}; else `{status:'refused',code:'NGHS-ITEM-CONTINUATION-PREDECESSOR-INVALID',reason:<which condition: absent from the queue | still <state> | cancelled with class <class>>,repair:'cancel the predecessor first: node <slice-queue.mjs> cancel <slice id> --class budget (or wrong-premise), then regenerate the binding ...'}`. Call it in `prepareGovernedItemQueue` right after `existing` is read (line 1080, before any queue write) and set `continuationOf` on the pushed row (line 1102) and on a rebound row (line 1101); call it again at admission (line 213-221) against `deliveryQueue.normalized.slices` when `binding.itemDelivery?.continuationOf` is set. Register the new code wherever NGHS codes are listed if a code table exists in these files.
4. Run NGHS52/NGHS53 GREEN, then the whole test file in clone and clone2 (baseline), compare failing-name sets, `driver.mjs patch`, `driver.mjs check`, then `driver.mjs cleanup`.

## Second clause (catalogue-source-closure): follow-up, outside the six slice files

`catalogue-source-closure` is produced at `plugins/pipeline-core/lib/session-authority-registry.mjs` line 370 (`closedCatalogue`: `fail('SDC-AUTHORITY-UNAVAILABLE','catalogue-source-closure')`) and consumed at `plugins/pipeline-core/scripts/session-authority-repair.mjs` lines 254 and 264. Neither is in the slice files; do NOT edit them here. Follow-up one-line change: at line 370 pass a hint as the third argument (or add a `repair` text to the refusal) naming the catalogue rule (the participant set and exactly 12 producers must match the installed catalogue) and the repair (`session-authority-repair.mjs` heal/migrate). No RED case was written for it.

## Not done / follow-ups

- Dispatch-briefing generation has no flag for the field yet: follow-up `--continuation-of <slice id>` in the briefing generator (outside these files).
- No patch, no apply check, no baseline-versus-patched failing-name comparison.

## Proposed commit message

`feat(goldfish): let a package name the stopped slice it continues (PF-85 slice 1a)`

## Operator flow (once a patch exists)

apply-diff the held patch, `git add -u -- <the six slice files>`, `--no-verify` commit by the PO ceremony, stamp, install. Protected paths observed: none of the six files matches TP-1..TP-13 (agent-obligations section 2). An independent Critic review stays a parent-owned batch gate; targeted delivery: blocked (checkpoint).
