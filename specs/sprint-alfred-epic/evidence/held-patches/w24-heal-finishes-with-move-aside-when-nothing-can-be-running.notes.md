# Held patch notes — heal finishes with the retained-aside move-aside when its own retirement is all that is left (candidate 15c, interim)

Patch: `w24-heal-finishes-with-move-aside-when-nothing-can-be-running.patch`. Apply AFTER `w23` (the D231 owner route): both change `lib/routine-repair.mjs` (w23 releases a dead owner-route binding first and adds `ownerRoute` to the heal result), so this patch was regenerated on the stacked tree and does not apply on the bare tree. Interim for the cases the host-commit fix (`w22`) does not cover: a Goldfish ending without a host commit
(plain-text stop, `checkpoint` hand-back, Elephant hand commit, cancel) leaves its registry member `armed`.

## Cause (see the w22 notes for the measurement)

`routine-repair run heal` retires the settled pending states first. For a dispatch whose member is still `armed`/`running`, that moves the member's source facts out of the
native-goldfish namespace; the registry's drift heal (PF-55) keeps its strict refusal for a bound armed member, so `session-authority-repair heal` ends `SAR-HEAL-INCOMPLETE`.
The human then had to run a second command, and `routine-repair run move-aside` could not even do it: its heal-first branch returned the incomplete heal as a failure and never
reached the move-aside (the ledger shows `move-aside` -> `SAR-HEAL-INCOMPLETE` four times), so the session-authority-repair verb had to be called directly.

## What

`lib/routine-repair.mjs`:
- `heal`: when the delegated heal ends `SAR-HEAL-INCOMPLETE` and a reconcile-refused/drifted producer is what is left, heal runs `session-authority-repair move-aside --no-goldfish-running`
  itself, re-inspects, and ends `healed-by-move-aside` only when inspect reports no finding. Admitted only when (all read from state, not asserted): the retirement step ran, no pending state
  was kept (an unsettled or unreadable pending file is kept), no authority record was kept, and every finding is a reconcile-refused or drifted producer (an open item reservation, a held lock
  or any other finding keeps the human in the loop). Otherwise heal returns what it returned before plus `autoMoveAside: { attempted: false, why }` and the `next` step.
  A failed move-aside or a registry that still refuses after it is reported (`autoMoveAside.code`), exit 2.
- `move-aside` kind: the heal-first branch continues after a heal that ends `SAR-HEAL-INCOMPLETE` (any other failed heal still stops there).
- The `heal` entry of the closed list says so. The list itself, the ledger and the retained-aside rule are unchanged: nothing is deleted, one ledger line per run.

`lib/routine-repair.test.mjs`: seven cases appended (auto path with ledger and argv; unsettled pending keeps it; held lock keeps it; other heal failure / successful heal never moves aside;
move-aside failure and still-refused after it; the move-aside kind continues; clean project unchanged). The existing cases are unchanged; the case "a heal that ends SAR-HEAL-INCOMPLETE with a
drifted producer still names the move-aside routine" now reaches its assertion through the verify-fails branch (the stub keeps refusing), intent unchanged.

## Evidence

- routine-repair suite 40/40; with dispatch-briefing and case-completion suites 204/204; doc contracts valid.
- Mutation: disabling `healIncomplete` turns five of the new cases red.
- No pinned count moves.

## Not covered / honest limits

- "No Goldfish runs" is decided from the kept-pending and reservation state, not from the process table: a Goldfish with a pending state is always kept (unsettled), but a process the host never wrote a pending state for is invisible here.
- The registry is discarded wholesale (retained aside): every member restarts, which is what the manual move-aside did. The structural fix is a per-member abandon transition for settled slices.
- Real-registry run: not done (stub-driven like the rest of the suite). First live check: the next heal after an Elephant hand commit.
- Overlaps `lib/routine-repair.mjs` with the D231 slice 1 patch (orphan owner-route binding release): apply order or regeneration on the full stack decides.
