# w236: every registry boundary entry of a Goldfish admission waits for a sibling's lock within the admission deadline; two launches of one reply are both admitted (C19I-W236-ADMIT)

Criterion binding: AC-108 is the closest accepted criterion; the PRD and the Spec are unchanged. Applies on the applied 19h chain (base 79899694d). Developed in the slice clone, delivered as the held patch next to this file.

## Found

Windows 19h: two Goldfish launches of one reply were both refused `NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD: integration readiness refused (SDC-LOCK-HELD): registry-lock-held`. Linux 19h (four launches): two admitted, two refused `SDC-AUTHORITY-UNAVAILABLE ... item-delivery-queue-drift`. Both reproduce on the unchanged code (the new cases NGPA1, NGPA4, NGPA6, NGPA7 are RED there: the drift refusal for the launch that prepared its queue row first, and `refused SDC-LOCK-HELD` after the 1.5 s bounded wait for the readiness read).

Registry boundary entries on the admission path (hook entry to the reserve write), file:line in `plugins/pipeline-core/lib/native-goldfish-host-state.mjs` at the base:

| Entry | Where | Waited before? | Now |
| --- | --- | --- | --- |
| `prepareGovernedItemQueue` boundary (guard-dispatch single productive dispatch, and again from the host-state preparation) | 1196 | yes (w233, `retryPublishWhileLockHeld`) | unchanged |
| `observeGovernedItemIntegrationReadiness` called from `prepareGovernedItemQueue` | 1263 -> 1710 | nested in the active boundary: reuses the token, never takes the lock | unchanged |
| `observeGovernedItemIntegrationReadiness` called from the host-state preparation when the slice has dependencies | 294 -> 1710 | NO: one bounded 1.5 s wait, and the throw was caught at 1715 and returned as `refused` (the Windows refusal) | waits (`retryPublishWhileLockHeld` with the admission deadline) |
| `migrateSourceUpdatedSessionAuthorityRegistry` in the publish | 865 | yes (inside the 336 publish retry, callback not yet entered) | unchanged |
| `initializeSessionAuthorityRegistry` in the publish (registry never created) | 871 | NO: the registry function turns the held lock into `status: unavailable`, which 872 rethrew as a non-transient fault | rethrown as `SDC-LOCK-HELD`, so the publish retry waits (only the exact `registry-lock-held` reason, never a lock fault raised after the callback ran) |
| `withSessionAuthorityBoundary` of the publish (prescan adoption, collision checks, reserve, pending write) | 886 | yes (336) | unchanged |
| `prescanAdmissionFacts` read scope | 884 | lock-free read, a fault already falls back to the in-boundary reads | unchanged |
| `rollbackGovernedItemQueue` boundary | 1287 | 10 s default, refusal path only | unchanged |

The queue drift: `state.delivery.queueSha256` is taken when this admission prepares its queue row (line 303) and compared with the queue read under the lock (line 892). A sibling launch of the same reply that prepares its own row in between changes the queue bytes, so the earlier launch was refused although its own row was untouched.

## What it changes (`plugins/pipeline-core/lib/native-goldfish-host-state.mjs`, new test file only besides)

- `observeGovernedItemIntegrationReadiness({root, admissionDeadline, publishRetry})` enters the registry boundary through `retryPublishWhileLockHeld`; the host-state preparation passes its admission deadline (and the test-only `publishRetry`). Only a lock met before the read ran is retried. A caller without a deadline (`scripts/slice-queue.mjs`, `scripts/dispatch-briefing.mjs`, `lib/agy-session-dispatch.mjs`) now waits the 10 s default of the queue writers instead of the single 1.5 s wait.
- The publish passes the queue rows it prepared against to `publishNativeAuthorityState`. On a queue digest mismatch under the lock, `queueMovedBySiblingOnly` lets the admission continue only when its own row is byte-identical to the prepared one and no row new or changed since then overlaps its write scope; the persisted state then names the fresh queue digest. Everything after (own row ready, dependencies, registry reservation and pending-state collision checks) already runs on the fresh queue under the lock. A changed own row, an overlapping new row, or a non-required queue still refuses `item-delivery-queue-drift`.
- `initializeSessionAuthorityRegistry`'s swallowed `SDC-LOCK-HELD: registry-lock-held` is rethrown as the transient lock fault so the existing publish retry waits for it.
- No change to the registry locking protocol, its 1.5 s per-acquisition wait, `guard-dispatch.mjs`, the SubagentStop path, or any registry/backend/domain-owner module.

## Checks

- New file `plugins/pipeline-core/lib/native-goldfish-host-parallel-admission.test.mjs`, cases NGPA1 to NGPA7 (written and run RED against the base before the first production edit; GREEN 7/7 after):
  - NGPA1 (deterministic): a sibling's whole admission runs between this launch's queue preparation and its publish (via the injected baseline capture); both are admitted.
  - NGPA2: the admission's own row changed -> still `item-delivery-queue-drift`, no pending state.
  - NGPA3: a new row overlapping the admission's write scope -> still `item-delivery-queue-drift`, no pending state.
  - NGPA4: the dependency readiness read waits for a sibling's registry lock (about 5 s hold) within the deadline and observes; with the deadline spent it refuses `SDC-LOCK-HELD`.
  - NGPA5: a lock held past the admission deadline at the publish still refuses `SDC-LOCK-HELD`, no pending state.
  - NGPA6: two real admissions of one reply started at the same instant (two child processes, own controlled-method runtime each, real registry fixture, disjoint write scopes) are both admitted.
  - NGPA7: the same with four launches.
- Suites on the slice clone (via `scratch/agent-out/test-in.mjs`), one at a time, all exit 0: `native-goldfish-host-parallel-admission.test.mjs` 7/7 (84.8 s RED run: 4 failing NGPA1, NGPA4, NGPA6, NGPA7; NGPA2, NGPA3, NGPA5 are guards that hold on both sides), `native-goldfish-host-state.test.mjs` 79/79, `hooks/guard-dispatch.test.mjs` 83/83, `scripts/dispatch-briefing.test.mjs` 162/162, `scripts/slice-queue.test.mjs` 20/20.
- `node --test` of the `.check.test.mjs` next to this file: patch present, non-empty, touches only `plugins/pipeline-core/hooks/` and `plugins/pipeline-core/lib/`.

## Needs registration by the Elephant (not done here)

New test file `plugins/pipeline-core/lib/native-goldfish-host-parallel-admission.test.mjs`; case ids NGPA1, NGPA2, NGPA3, NGPA4, NGPA5, NGPA6, NGPA7. `harness/verify-suites.json` and the case-completion augmentations were not touched.

## Not changed / not proven

- No real launch pair on Windows ran on this code. The Linux end-to-end cases start 2 and 4 launches at once; the four-launch Windows wait (each registry cycle tens of seconds) is not measured.
- A sibling whose write scope matches a critical-path pattern creates or extends the shared Critic row (`writeScope: []`). `scopesOverlap([], scope)` is false (probed), so that row never refuses an admission; no case covers a critical-path sibling (the fixtures write `src/*.mjs`).
- `retryPublishWhileLockHeld` still caps one wait at 60 s (w233); a sibling that holds the lock for more than 60 s at a time still refuses the waiting launch, with the same typed code.
- Each retry of the publish repeats its pre-lock work (prescan, repository inspect); the git evidence scan is memoised per process, the registry read scope is not. Left as is.
- `rollbackGovernedItemQueue` keeps its 10 s default (refusal path only). When a sibling changed the queue after a refused launch wrote its row, the existing compare-and-swap rollback still leaves that row (unchanged behaviour).
- No full Verify run, no independent Critic review; both stay with the Coordinator.
