# Critic C6g1 correction-diff review 2 of 3: result

Review object: b58dda23c (CORR-A2), read with `git show`. Route: requested claude-sonnet-5-5 at high; observed claude-sonnet-5-5.
Verdict: **FAIL** (one major and one minor finding). The 80 % checkpoint fired at call 36 of 45.
Notes: scratch/dispatch/critic-a464ce214d72b774a/critic-notes.md (local, untracked).

| ID | Severity | Gap | Evidence |
|----|----------|-----|----------|
| G1-D2-F1 | major | The closed `cp` option table lists `--sparse` as a no-argument flag, but GNU cp takes `--sparse=WHEN` with a mandatory argument. A separated trailing `--sparse always` leaves `always` as the last operand. The written destination is then misjudged, and a write to another repository passes. | plugins/pipeline-core/lib/guard/po-commands.mjs:129 (cp.longFlags contains `sparse`; cp.longValues lacks it); no pin mentions `sparse` |
| G1-D2-F2 | minor | The pin now refuses an outside `mv` source, but the backlog item's acceptance still says only the destination of cp/mv/install is the write target. | backlog/items/2026-10-04-git-hook-runtime-snapshots-go-stale-after-plugin-changes.md:54-55 vs the P3 pin header; spec.md:3102 (AC-179) |

Not reached: the five guardrail files, passive-read-policy.mjs, isApprovedSingleCommandReadArg, the other `ext-diff` files, and running either pin.
Trajectory: not verifiable. There is no tracked run artifact for the two pins.

## Coordinator disposition

- G1-D2-F1: correction dispatch ALF-C-C6G1-CORR-A3. It moves `sparse` into `cp.longValues` as a signature-bound patch (protected path) and adds a refused case and an allowed case to the pin.
- G1-D2-F2: the same dispatch amends the backlog item's acceptance wording for mv. Under the current behaviour, mv sources are writes because mv removes them.
- One more correction-diff review (3 of 3, final) follows on the fix.
