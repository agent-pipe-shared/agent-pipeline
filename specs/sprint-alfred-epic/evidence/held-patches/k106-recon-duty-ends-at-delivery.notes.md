# K106-RECON-DUTY-ENDS-AT-DELIVERY notes (clone k95, commit `4e0cdcc48` on top of K95 `4b973e758`)

Status: implementation complete in clone; independent Critic read, operator commit of the protected parts and PO acceptance pending.

## Cause
D75 (A) made the recon-note duty permanent: a wrong-premise cancel of an item required a `reconNote` for every later briefing of that item, also after the successor landed. PO decision 2026-10-23: the duty ends after a delivery.

## Finding that shaped the build (the briefing's premise differs from the code)
The queue lib has NO stored delivered/merged/closed state: `SLICE_STATES` = ready, hold-po, blocked-external, deferred, cancelled. "Delivered" is derived: `readyAndLive` (lib/slice-queue.mjs) marks a slice `done` when its id is in the integrated ids (v2 item queue: `observeGovernedItemIntegrationReadiness` in lib/native-goldfish-host-state.mjs = native integration record OR orchestrator commit evidence `Dispatch: <id> (goldfish)` after the base touching the write scope; v1: terminal record / terminalIds). Smallest reading chosen: delivered row = a queue row of the SAME `delivery.itemId` whose id is in the integrated ids (excluding the wrong-premise rows themselves). The derived vocabulary is exactly `done` (counts keys ready|live|done|held|blocked|cancelled).

## Change (all unprotected; the protected lib file is untouched by K106)
- `scripts/dispatch-briefing.mjs`: new injectable dep `integratedSliceIds` (default `defaultIntegratedSliceIds`: `observeGovernedItemIntegrationReadiness`, `[]` on refusal/fault); `hasDeliveredSliceOfItem` (never throws; a null/non-list/throwing reader = not delivered = duty stays). The integration read happens only when a wrong-premise cancel exists. Order of rows irrelevant. Refusal text keeps the exact repair and adds: "This duty ends once a slice of item <id> has been delivered (integrated into the candidate)".
- `skills/pipeline-start/references/workflow-dispatch.md`: the one D75 paragraph gets the end-of-duty sentence.
- Tests (`scripts/dispatch-briefing.test.mjs`, +4 cases): (a) delivered successor, both row orders and package route -> generated; (b) ready/hold-po/deferred/blocked-external successor -> still refused + message names the end condition; (c) other item's delivered row, integrated id with no row, null/throwing reader, wrong-premise row itself integrated -> still refused; (d) pin: `SLICE_STATES` exact set and `readyAndLive` counts keys + `done` status (a new state/status fails and forces the decision).

## Counts (alone, private TMPDIR; runner `scratch/K106-RECON-DUTY-ENDS-AT-DELIVERY-run.mjs <label> <file>`; log `scratch/agent-out/K106-RECON-DUTY-ENDS-AT-DELIVERY-results.txt`)
- `scripts/dispatch-briefing.test.mjs`: K95 end state 62/62 -> RED run with 4 new cases 66 tests, 2 fail (case a, and case b's end-condition message: the intended reasons, feature absent) -> after 66/66. Cases (c) and (d) pass on the unchanged code by design (they pin kept behaviour/vocabulary).
- `lib/slice-queue.test.mjs` 40/40 -> 40/40; `scripts/slice-queue.test.mjs` 19/19 -> 19/19; `lib/dispatch-briefing-route-record.test.mjs` 13/13 -> 13/13; `lib/pins/budget-checkpoint-fires-below-the-briefed-cap.test.mjs` 11/11 -> 11/11; `lib/pins/greenfield-machine-output-and-skill-budget.test.mjs` 15/15 -> 15/15; `harness/scripts/check-consumer-safe-paths.test.mjs` 9/9. "Before" for these = K95 end state (not re-run before the edit; nothing they exercise was touched before).

## Diffs (`git apply --check` run through Node execFileSync in a throwaway clone of `scratch/clones/k91`, head `c22912b0a`: clean; also clean stacked, protected after unprotected)
- `scratch/agent-out/K106-RECON-DUTY-ENDS-AT-DELIVERY-k95-unprotected.diff`: combined K95+K106, 3 files (script, test, workflow-dispatch.md). Replaces `K95-...-unprotected.diff`.
- `scratch/agent-out/K106-RECON-DUTY-ENDS-AT-DELIVERY-k95-protected.diff`: K106 does not change the protected lib file; this is the K95 protected diff unchanged (byte-identical, checked) for `plugins/pipeline-core/lib/dispatch-briefing-build.mjs`; applies after the bundle. Operator applies it before or with the unprotected commit.
- Clone state: commit `4e0cdcc48` carries K106; the protected K95 edit is still uncommitted in the clone working tree.

## Risks
- Delivery detection depends on integration evidence being visible at briefing time (orchestrator commit trailer with the slice id, or a native integration record). A delivery without such evidence keeps the duty (safe direction; the note is then needed).
- An item queue where the integration observation is refused (e.g. registry fault) also keeps the duty.
- The default reader (real git log) is not exercised by a unit case; the injected reader and the pins are.

## Ratchet effect (report only)
`scripts/dispatch-briefing.mjs` 806 -> 832 lines, test 887 -> 944; both under 1000. `architecture-boundary-check.mjs` not re-run.

## Proposed commit message (already used in the clone)
```
feat(dispatch-briefing): end the recon-note duty once the item was delivered (D75 A)

AI-Assisted: true
Dispatch: K106-RECON-DUTY-ENDS-AT-DELIVERY (goldfish)
```
