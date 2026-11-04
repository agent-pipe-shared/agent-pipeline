# w213: a deferred heal and a cancel without a queue row name a repair that can really be run

Found by the native Windows consumer session while it prepared the 19d measurement (2026-11-04): two stale reservations of earlier probes (`gf-probe-1`, `gf-probe-2`) could not be removed by the route the tools named.

- `slice-queue.mjs cancel gf-probe-1 --started ...` answered `SQ-NOT-FOUND` because the queue rows had been discarded (`git restore`) while the native dispatch states remained.
- `routine-repair.mjs run heal` deferred every retirement (`settledPending.deferred`, count 4) because the stale members counted as armed (`inFlight 2`), and told the reader to "run heal again when nothing is armed". A member whose dispatch ended without a release stays armed for ever and heal never un-arms it, so that sentence never comes true.
- Only `session-authority-repair.mjs move-aside --no-goldfish-running` helped, and it leaves the pending files.

The PO's rule (never fully blocking): every refusal needs a repair the agent or the PO can actually run.

## Change (texts and one field only; no repair step changes)

- `lib/routine-repair.mjs`: the heal deferral keeps its wording (`armed or running`, `run heal again`) and adds the way out for the case that no Goldfish runs, and a `next` field with the move-aside command (`moveAsideNext()`, the same text heal already prints elsewhere).
- `lib/native-goldfish-host-state.mjs`: `cancelUnstartedGovernedItemSlice` answers `SQ-NOT-FOUND` as before, and adds a `repair` when a native dispatch state still names the slice: it says why a cancel has nothing to change and names heal and move-aside. A slice no state names gets no repair text. The `slice-queue.mjs` CLI already forwards `repair`.

## Tests

- `routine-repair.test.mjs` (C19 case): the deferral names the move-aside way out and carries `next`.
- `native-goldfish-host-state.test.mjs` NGHS37: after the queue row of a started slice is removed, the cancel answers `SQ-NOT-FOUND` with the heal and move-aside repair; an unknown slice has none.

## Result in the work clone

routine-repair 43/43; NGHS37 passes.

## Not changed (open)

The design gap behind the cycle stays: a dead dispatch's armed member can only be released by move-aside, which retains the whole registry aside and leaves the pending files. A targeted release of one orphaned member (with proof that its dispatch is dead) needs a design decision and a Critic review; it is not built here.
