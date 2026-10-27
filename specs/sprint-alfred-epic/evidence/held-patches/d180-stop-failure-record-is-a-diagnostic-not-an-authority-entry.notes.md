# D180 held patch: STOPPED on the after-init measurement (no patch delivered)

Dispatch W6-D180-STOP-FAILURE-DIAGNOSTIC-C2-20261027. Candidate 3378b560d2a1e3fbf4d5a3b2655ba6a72f19339f.

## Cause

The finalizer (`recordSubagentStopOutcome`) writes `stop-failure-<32 hex>.json` into the
native-goldfish-host-commit namespace. `readNativeManagedInventory(...,"native-goldfish")`
throws `native-managed-unknown-native-entry` for that name, so the inventory is unreadable.

## Decision (given by the briefing): option (b), admit the file

Every consumer of the inventory selects entries by name prefix or by sourceFact.sha256, so an
extra `stop-failure-` entry is ignored. The membership digest is taken from the physical listing
before any filter, so admitting (b) and filtering (c) give the same digest.

## Change tried in the clone only

In `plugins/pipeline-core/lib/native-managed-authority-support.mjs`:
- name regex gained the alternative `stop-failure-[a-f0-9]{32}`;
- schema check gained `relativePath.startsWith('stop-failure-') && value.schema !== 'pipeline.native-goldfish-host-stop-failure.v1'`
  (same `native-managed-native-schema` fault).

## Test cases (clone, session-authority-repair.test.mjs; ids ascending)

- SAR16 file planted BEFORE registry init: registry readable, native-goldfish producer ok.
- SAR17 file planted AFTER registry init: same assertions.
- SAR18 wrong schema / array body still refused (native-managed-native-schema / native-managed-invalid-record).
- SAR19 near-miss names still native-managed-unknown-native-entry.

RED against unchanged production (tests 19, pass 16, fail 3): SAR16, SAR17, SAR18 red
(SAR18 red because the schema refusal could not be reached: the name was refused earlier as unknown).
SAR19 green (regression pin).

GREEN with the change (tests 19, pass 18, fail 1): SAR16, SAR18, SAR19 green; SAR17 RED.

## The after-init measurement (the stop condition)

With the file planted after registry init and the production change applied:

    registry.read = {"status":"refused","code":"SDC-AUTHORITY-CAS","reason":"native-goldfish:namespace-drift"}
    producer native-goldfish = {"status":"drifted","drifted":["native-goldfish-host-commit"]}

So admitting the file makes the inventory readable, but a stop-failure file appearing after
the registry baseline still drifts the namespace and refuses the registry read. The briefing
says this means heal must retire the file (Wanted 2) and the deliverable changes. Per the stop
condition no patch was written; the registry/baseline side (outside the briefed two files, or
a heal that retires or re-baselines the stop-failure file) is needed.

Not run: baseline-vs-patched comparison across other suites, patch apply-check (no patch exists).
Logs (scratch, untracked): scratch/agent-out/wd180/red.*.log and green.*.log.

## NOT done

Wanted 2 (heal retiring a stop-failure record whose dispatch is no longer in flight), Wanted 3
(move-aside and next text say what they cannot clear), any consumer-run proof.

## Proposed commit message (only if the deliverable is re-scoped)

fix(authority): the native Goldfish inventory accepts the finalizer stop-failure diagnostic (D180)

Native Goldfish authority is a gate component: an independent Critic review stays a parent-owned batch gate.
