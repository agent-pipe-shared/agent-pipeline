# W7-D193 -- notes (state: HELD, built by the Elephant in a scratch clone under the D192 exception)

Candidate `305afcf3b`. Patch: `w7-d193-tier-is-refused-not-raised-above-the-cap.patch` (3 paths, `git apply --check` exit 0). Independent of the other pending patches (disjoint files).

## What it delivers (PO decision D193, 2026-10-29: "refuse with a pointer to a grant in the package")

- `lib/dispatch-briefing-build.mjs` `budgetDecision(pkg, budget)`: an estimate above the requested tier's cap is no longer bound to `goldfish-deep` behind the dispatcher's back. Without `budgetRationale` the generator refuses with `DBG-PACKAGE-BUDGET-EXCEEDED`, saying the tier is not raised silently and naming the three ways out: add `budgetRationale` (the dispatcher plans a grant and continues the same agent at the checkpoint, D191), set `agentType` to `goldfish-deep` together with that rationale, or split the outcome into slices with disjoint scopes. With a `budgetRationale` the briefing keeps the tier the package named and renders the existing "Budget grant expected at the 80 % checkpoint" line. The `goldfish-deep` path is unchanged in spirit (a rationale is needed above its cap).
- `scripts/dispatch-briefing.mjs`: the second binding to `goldfish-deep` and the `DBG-PACKAGE-TIER-RAISED` warning are removed; the build binds once.
- `scripts/dispatch-briefing.test.mjs`: the case that pinned the silent raise now pins the refusal (code, "not raised silently", `budgetRationale`, `goldfish-deep` named) and the rationale route (tier unchanged, no raise warning, grant line rendered); the remaining part of that case (above the deep cap) is unchanged.

## Checks (scratch clone, committed candidate)

- `scripts/dispatch-briefing.test.mjs`: 102 tests, 102 pass, 0 fail, including the changed case.
- No other file reads `DBG-PACKAGE-TIER-RAISED`; the slice queue assigns tiers on its own and is untouched.

## NOT in this patch

- The dry-run probe and the "check accepts the repository's real verify command" part of the first-dispatch item are not built (the check field still demands a `.test.mjs|cjs|js` path, `DBG-CHECK-NOT-TEST`). The matrix row `first-dispatch round trips` therefore stays at 50.
- Full Verify, batch Critic and PO acceptance remain pending. Kernel path: the PO applies the patch in the same ceremony.
