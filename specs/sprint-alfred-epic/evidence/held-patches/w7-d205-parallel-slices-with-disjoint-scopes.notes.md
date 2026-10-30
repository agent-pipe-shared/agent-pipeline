# Held patch notes: parallel slices with disjoint scopes (D205, PO 2026-10-30)

Patch: `w7-d205-parallel-slices-with-disjoint-scopes.patch`, built against candidate `be24eaad4b3a748a89d06bcb78ebfbcdf210942c`, applies on the plain candidate (`git apply --check`). Nothing committed; the PO applies it in the bundled ceremony.

## Behaviour

Two Goldfish slices that bind the same item or the same criterion are admitted at the same time when their write scopes do not overlap, on the native and the Antigravity route. A held reservation now blocks a new slice in exactly two cases: the same slice id (a slice is never admitted twice) or an overlapping write scope (`scopesOverlap`, unjudgeable scope overlaps). Cancelled or integrated slices still free as before (D51).

## Production changes (two files)

- `plugins/pipeline-core/lib/native-goldfish-host-state.mjs`
  - new exported `itemReservationCollision(pending, next)` (`{sliceId, writeScope}` each; answers `'same-slice'`, `'scope'` or `null`) and `itemReservationCollisionReason(collision)`: the one predicate of both routes.
  - the two reservation loops (Antigravity reservations, native pending entries) call it; the owner, criterion-owner and scope checks collapse into it. Reasons that can still fire: `item-delivery-owner-collision` (same slice) and `item-delivery-scope-collision` (keeps its repair text).
  - removed as unreachable: `CRITERION_OWNER_COLLISION_TEACHING`, `criterionOwnerCollisionFault` and the reason `item-delivery-criterion-owner-collision` (the criterion alone can no longer refuse; the same slice already refuses by owner). No other importer exists (searched `plugins`, `scripts`, `harness`).
- `plugins/pipeline-core/lib/agy-session-dispatch.mjs`
  - the native-reservation loop and the AGY latest-entries loop call the same `itemReservationCollision`; `AGY-ITEM-OWNER-COLLISION` (same slice) and `AGY-ITEM-SCOPE-COLLISION` remain, `AGY-ITEM-CRITERION-OWNER-COLLISION` is removed; the now unused `scopesOverlap` and criterion digest are dropped.

## Test changes

`native-goldfish-host-state.test.mjs` (comment `D205: disjoint scopes admitted, PO 2026-10-30` in each restated case):

- NGHS07 (was line ~339): same item, disjoint scope, now admitted (was owner collision). The existing ITEM-D overlap case keeps the scope refusal.
- NGHS10 (~426): second slice on the same item, disjoint scope, now admitted.
- NGHS16 (~565, the PF-66 alias case): same criterion under another item label, disjoint scope, now admitted; the PF-66 teaching regex is removed with the teaching. Added: an overlapping scope on the same criterion is still refused (the queue ordering holds it behind FIRST, `NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD`; preparation of an overlapping slice never reaches the reservation check).
- NGHS44 (~1277): the owner-collision repair pin now fires for the same slice dispatched twice (distinct tool-use id, `launch` gained an optional fourth argument); ITEM-B on the same item with a disjoint scope is admitted.
- NGHS45 (~1330, not named in the briefing; found red by the suite): ITEM-C shares ITEM-A's item; its queue scope is now `src/a.mjs` (queue replaced as in NGHS07) so the refusal is the scope collision, asserted by exact code instead of the three-way regex.
- NGHS58 (new): unit pins of the shared predicate (disjoint null, same slice, overlap, unjudgeable, no-slice reservation; teaching export removed).
- NGHS59 (new): end to end on the native route: LEFT and RIGHT, same item `AC-1`, same criterion, disjoint scopes, both admitted; both author; LEFT returned and delivered (commit), RIGHT returned on top of LEFT's commit (observation v3 foreignCommits, parent equals LEFT's commit); both integrated; the settled set (`observeGovernedItemIntegrationReadiness`) frees both.

`agy-item-delivery.test.mjs` (AGYID05, ~111; needs the lib test file in the patch although the briefing's host write scope names only `native-goldfish-host-state.test.mjs`): the alias with a disjoint scope is admitted past the reservation check; added the same slice twice (`AGY-ITEM-OWNER-COLLISION`) and an overlapping scope on the same criterion (held behind the first slice, `NGHS-ITEM-INTEGRATION-DEPENDENCY-HELD`).

## Evidence (clone logs under scratch/agent-out/w7par, not tracked)

- RED before production edit (c1red): native suite 7 failing (NGHS07, NGHS10, NGHS16, NGHS44, NGHS45, NGHS58, NGHS59); agy-item-delivery AGYID05 failing. (NGHS45 was red there through a queue-validity error of the first draft; its corrected form was proven red by the revert run.)
- Baseline (base1, plain candidate): native 62/62, agy-item-delivery 6/6, agy-session-dispatch 10/10, scripts/slice-queue 20/20, lib/slice-queue 40/40, dispatch-briefing 132/132, all green.
- Revert proof (production files reverted, tests kept): the same 7 native cases and AGYID05 fail; production restored byte-equal.
- Final clone (production as in the patch): native-goldfish-host-state 64/64 (62 plus NGHS58 and NGHS59); agy-item-delivery 6/6; agy-session-dispatch 10/10; scripts/slice-queue 20/20; lib/slice-queue 40/40; dispatch-briefing 132/132. Failing-name sets: baseline empty, final empty.
- Patch: 4 files (the two production files, native-goldfish-host-state.test.mjs, agy-item-delivery.test.mjs), 91 insertions, 32 deletions; `git apply --check` on the plain candidate clone exit 0.

## Out-of-scope observations (left untouched)

- Lookups keyed by item id alone (for example `inspectNativeGoldfishItemDelivery` items list) can now see two slices of one item; not needed for admission or delivery and not changed here.
- Queue ordering (`orderAndCoverAdmittedSlice`) already serialises slices with overlapping scopes by a dependency, so an overlapping slice prepared through `prepareGovernedItemQueue` is held at the dependency check before the reservation check; the reservation check remains the backstop (queue replacement, amendments).
