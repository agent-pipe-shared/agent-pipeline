---
schema: pipeline.backlog-item.v1
id: pipeline.a-stop-failure-diagnostic-makes-the-native-goldfish-inventory-unreadable
type: defect
owner: pipeline
status: open
created: 2026-10-27
priority: P1
release: 0.7.0
sprint: alfred
source: "Observed in the Elephant session of 2026-10-27 after dispatch W6-D174-PF81-PNPMLOCK-C1-20261027 stopped with NGHR-FINAL-JSON"
done_when: manual
---

# A stop-failure diagnostic makes the native Goldfish inventory unreadable and blocks every later dispatch

## Evidence

After a background Goldfish stopped without a host commit, `finalizeNativeGoldfishHostReturn` left
`stop-failure-<32 hex>.json` (schema `pipeline.native-goldfish-host-stop-failure.v1`, code `NGHR-FINAL-JSON`) in
`.git/agent-pipeline/run/native-goldfish-host-commit/` (`recordSubagentStopOutcome`,
`lib/native-goldfish-host-finalizer.mjs`). The next dispatch was blocked before launch:
`SDC-AUTHORITY-UNAVAILABLE: item-delivery-registry-initialization-failed (native-managed-unknown-native-entry)`, and
`session-authority-repair.mjs heal` refused with `SAR-HEAL-INCOMPLETE`.

Cause: `readNativeManagedInventory` (`lib/native-managed-authority-support.mjs`, the `classifyEntry` regex for the
`native-goldfish` domain) admits `pending-`, `agent-codex-`, `observation-` and `authority-*` names only. The finalizer's
own diagnostic is not in that list, so the inventory throws `native-managed-unknown-native-entry` for a file the product
wrote itself. The finalizer comment promises "A later success removes it", but a later success cannot exist for a
stopped dispatch that is not re-run.

## Why the offered repair does not clear it

`session-authority-repair.mjs move-aside` retains the registry and starts it fresh, but the stop-failure file lives in
the native directory, not in the registry. After `move-aside` the next dispatch fails with the same code. The tool's
`next` list names `move-aside` as the last resort without saying that it cannot remove this cause, and no verb removes
a stop-failure record.

## Wanted

1. The inventory classifier accepts `stop-failure-<32 hex>.json` as a diagnostic that is not part of the authority
   fact set (the way post-terminal custody records are), or the finalizer writes it outside the inventoried namespace.
2. `heal` retires a stop-failure record whose dispatch is no longer in flight, retained aside like the other repairs.
3. `move-aside` and its `next` text say what they cannot clear.
4. Regression: a stopped dispatch with a stop-failure record leaves the registry readable and the next dispatch
   admitted.

## Boundaries

Native Goldfish authority is a gate component: independent Critic review stays a parent-owned batch gate. Until it is
fixed, a session that hits it needs the one stop-failure file moved aside by the PO or under a PO exception.
