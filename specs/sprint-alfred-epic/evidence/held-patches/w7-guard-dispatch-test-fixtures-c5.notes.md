# W7-GUARD-DISPATCH-TEST-FIXTURES-C5: Elephant probe, seven cases repaired, eight cases need a plan approval fixture

State: direct Elephant work after the two Goldfish checkpoints (c3, c4). No patch file: the repaired cases are committed directly (test-only, `plugins/pipeline-core/hooks/guard-dispatch.test.mjs`, commit `90fa209cf`). Suite: 75 tests, 67 pass, 8 fail (was 60/15).

## Done (D185: the guard order stays, the tests follow)
Seven cases now pin the refusal the guard really gives, each with a QG-04 justification comment:
- GD4 and GD9 (a Goldfish briefing assembled by hand, including the hand-filled real template): `DBG-GENERATED-BRIEFING-REQUIRED`. The completeness code `DISPATCH-INCOMPLETE-BRIEFING` stays pinned in `lib/dispatch-policy.test.mjs`.
- GD15a, GD15c, GD15e, GD15f, GD15j (no role, unknown namespaced role, malformed or empty Antigravity batch, Codex worker without a message): `DISPATCH-WRITE-CARRIER-REQUIRED`, still before any model call. `DISPATCH-ROLE-REQUIRED`, `DISPATCH-ROLE-UNKNOWN` and `DISPATCH-PROMPT-REQUIRED` stay pinned in `lib/dispatch-policy.test.mjs`, GD15b and GD15d.

## Still red (runtime ids GD58 to GD65, labels GD57 to GD64)
All eight use `markedGoldfishPrompt()`, a hand-assembled item briefing, which the guard now refuses first (`DBG-GENERATED-BRIEFING-REQUIRED`). Probing a generator-built briefing in the item-governed fixture gave this ladder (each rung needed one fixture change):
1. In-process build works: `runDispatchBriefing(["build", "--root", root, "--package", "scratch/pkg.json"], deps)` imported from `scripts/dispatch-briefing.mjs`, with `deps.observePreflight` returning a `loadedIdentity` of status `available`, `deps.resolveBaseline` returning `{ status: "ready", entries: [] }` and `deps.claudeRoute` returning an alias route at effort medium. The marker is produced by the real generator.
2. The calibration must sit at `.claude/pipeline.json` for this fixture (`DBG-PACKAGE-CALIBRATION-UNRESOLVED` otherwise), with `project`, `handover` and optionally `verify`.
3. The spec needs the normative shape: `## Acceptance criteria`, `| # | Criterion | Evidence |`, a row whose evidence column is a backlog item file that carries an `id:`; the package names it with `item` and `ac`.
4. The binding names the real HEAD, so the fixture needs a real commit (otherwise `SQ-ITEM-CANDIDATE-DRIFT`: binding candidate vs HEAD 000...), and the queue row's `delivery.baseCommit` must equal that HEAD; `delivery.itemId` is the item `id` (here `pipeline.sample-slug`), `criteria` the criterion id.
5. `.claude/pipeline-state.json` must be a private file (mode 0600, directory 0700), else `CVCT-FILE`.
6. NEXT BLOCKER, not solved: `CVCT-APPROVAL-UNAVAILABLE` -- the item course needs an eligible PO plan approval of the current PRD and spec (a plan approval record bound to PRD and spec digests, written by `pipeline-state.mjs`). The old fixture only set `planApproved: true`, which the generated route no longer accepts.

## Decision needed before the last step
With a real commit and a valid plan approval the guard probably no longer stops at `NGHS-CANDIDATE-MISMATCH` (the binding candidate equals HEAD), so the eight cases' expected outcomes change as well (they were written for "the fixture has no commit"). Two honest routes: (a) seed a real plan approval through the sanctioned writer in the fixture and re-derive each expectation (largest, keeps the background-route coverage at the hook boundary); (b) move the foreground and registered-route assertions to the host-state seam (`native-goldfish-host-state` tests) and keep one hook-level case. Route (a) is a deep-tier slice with the ladder above as its recon; nothing here needs a PO decision except that route (b) trims hook-level coverage.

## Kernel fact worth keeping
Nothing in the ladder is a product defect: each refusal is the guard doing its documented job on a fixture that predates the generated-briefing route. The one rough edge is that every refusal names the same repair (the generator command) even when the real cause is the fixture's missing commit or approval.

## Continuation card
done: seven cases, ladder steps 1 to 5. remaining: step 6 (plan approval fixture) and re-deriving the expected outcome of GD58 to GD65. next step: a deep-tier slice (D184 high; goldfish-deep is locked until the next install, so dispatch the implementor tier with the MP-05 rationale "test-suite authorship" or wait for the install).
