# K104-FANOUT-GUARD-LOAD-FAULT notes (implementation complete in clone `scratch/clones/k93`; independent Critic read, operator commit of the protected parts and PO acceptance pending)

## Cause (measured, `scratch/k104-probe.mjs`, `scratch/k104-graph.mjs`)
K93 gave `hooks/guard-dispatch.mjs` a static import of `lib/dispatch-record-liveness.mjs`. That module was previously reached only from
`scripts/dispatch-briefing.mjs` line 66, AFTER `project-onboarding-v3.mjs` had finished loading. With the new edge the cycle is:
`dispatch-briefing > critic-accepted-contract > pipeline-state > ... > chat-gate-ceremony > session-authority-registry > human-guard-override >
copy-safe-command > project-onboarding-v3 > push-gate-satisfiability > ... > role-dispatch-preflight > dispatch-briefing-route-record >
hooks/guard-dispatch > lib/dispatch-record-liveness > lib/guard/dispatch-record-lane > guard/verdict > guard/constants > project-onboarding-ready-gate`
and ready-gate line 94 reads `PROJECT_ONBOARDING_BASE_RESULT_KEYS` from `project-onboarding-v3` which is still mid-evaluation (TDZ).
Evidence: probe of `scripts/dispatch-briefing.mjs` FAILS in k93 before the fix, LOADS in k91 and after. The import order inside the guard
(K93's "move it last") cannot help: any static edge from the guard to the liveness module triggers it. (The liveness lib's own import list was never the cause.)

## Change (no new module; no kernel-list or threat-model entry needed)
- `hooks/guard-dispatch.mjs` (protected): the static import is gone; `governedQueueRow` removed; the call site now spawns
  `scripts/dispatch-record-liveness.mjs --root <root> --scope-overlap stdin` with the declared scopes (`dispatchWriteScope`, still exported) as JSON on stdin,
  relays its stderr, exits 2 on its exit 2, warns `GUARD-DISPATCH-SCOPE-UNJUDGED` and admits if the spawn fails. Same pattern as the existing `--second-writer` spawn
  (that script header already documents why: "a spawn, not an import"). Isolated calls are not spawned for (same truth table as before).
- `scripts/dispatch-record-liveness.mjs` (kernel, protected): new `--scope-overlap stdin` mode; imports `readRunningDispatches/scopeOverlapAdmission/scopeOverlapMode`
  (lib, already K93), `parseNativeGoldfishBriefing`, `resolveGovernedItemQueue`, `scopesOverlap`. All imported modules are ALREADY in `NEVER_LIFTABLE_KERNEL_PATHS`
  (native-goldfish-host-return.mjs, native-goldfish-host-state.mjs, slice-queue.mjs; lines 359/360/811), so `guard-maintenance-window-kernel-closure.test.mjs` stays green (1/1).
- `lib/dispatch-record-liveness.mjs`: only a comment updated (K93 content unchanged). `scripts/dispatch-briefing.mjs`: unchanged from K93 (delegates to `readRunningDispatches`).
- `lib/dispatch-scope-overlap.test.mjs` (unprotected): +3 cases (12 total): import-cycle pin (source has no edge to the liveness lib AND `dispatch-briefing.mjs`,
  `guard-dispatch.mjs`, `scripts/dispatch-record-liveness.mjs` each load in a fresh process), `--scope-overlap` enforce/shadow/disjoint/read-only/unknown, unusable input = exit 0 advisory.
- Message text and behaviour of K93 unchanged (hook-level cases of `guard-dispatch-fanout.test.mjs` run through the real spawn and stay green).

## Counts (each suite alone, runner `scratch/k104-run.mjs`, logs `scratch/agent-out/k104-*.log`, `k104-results.txt`)
| command (cwd scratch/clones/k93) | result |
|---|---|
| `node --test plugins/pipeline-core/hooks/guard-dispatch.test.mjs` | 67/67 green (was: load failure; baseline 67) |
| `node --test plugins/pipeline-core/hooks/guard-dispatch-fanout.test.mjs` | 34/34 green |
| `node --test plugins/pipeline-core/lib/dispatch-scope-overlap.test.mjs` | 12/12 green (K93 had 9) |
| `node --test plugins/pipeline-core/scripts/dispatch-briefing.test.mjs` | 55/55 green (was: load failure; baseline 55) |
| `node --test plugins/pipeline-core/lib/slice-queue.test.mjs` | 40/40 |
| `node --test plugins/pipeline-core/lib/dispatch-record-liveness.test.mjs` | 12/12 |
| `node --test harness/scripts/check-consumer-safe-paths.test.mjs` | 9/9 |
| `node --test plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs` | 1/1 |
RED (throwaway clone `scratch/clones/k104-apply` of k91 with both diffs applied, `scratch/k104-red.mjs`): baseline script without the mode -> 2 of 3 new cases fail
(10/12 pass); K93's static edge put back into the hook -> the pin fails (11/12) and `dispatch-briefing.test.mjs` fails to load (0/1).
Not run by me: the full verify gate; `architecture-boundary-check` against the clone is red for unrelated pre-existing items (rehearsal clone root scripts unowned, other ratchets), none mention the new code.

## Line counts (report only, `architecture/boundary-policy.json`)
guard-dispatch.mjs 1063 (K93: 1065; k91 bundle 1043; accepted maxLines 1037 -> 26 over, 20 over the bundle; not raised). guard-dispatch-fanout.test.mjs 624 (bundle 539), lib/dispatch-record-liveness.mjs 269 (150), scripts/dispatch-record-liveness.mjs 90 (61), scripts/dispatch-briefing.mjs 741 (775),
lib/dispatch-scope-overlap.test.mjs 147 (new). None of these other files has a policy entry; none exceeds 1000.

## Delivery
- `scratch/agent-out/K104-FANOUT-GUARD-LOAD-FAULT-k93-protected.diff`: guard-dispatch.mjs, guard-dispatch-fanout.test.mjs, lib/dispatch-record-liveness.mjs, scripts/dispatch-record-liveness.mjs.
- `scratch/agent-out/K104-FANOUT-GUARD-LOAD-FAULT-k93-unprotected.diff`: scripts/dispatch-briefing.mjs, lib/dispatch-scope-overlap.test.mjs.
- Both made against the k91 rehearsal tree (the k93 clone has the same base commit, `rehearsal: C28 critic preimage repin`); `git apply --check` OK for both via Node execFileSync in a throwaway clone of k91 (applies after the bundle). They SUPERSEDE the K93-FANOUT-GUARD-ENFORCE diffs.
- The clone `scratch/clones/k93` still carries all edits (nothing committed, per protected-path rules). Throwaway clones `scratch/clones/k104-apply` (mutated by the RED run) can be deleted.

## Risks
Each productive dispatch call now costs one more node spawn (about 1-2 s, import-heavy; same order as `--second-writer`). A failing spawn admits with a warning (fail-open, as second-writer).
Finding for the Critic: the guard keeps `scopesOverlap` import for the queue path only; the overlap predicate for this feature is the script's import of the same function.

## Proposed commits (trailers exactly two lines)
1. protected (operator): `feat(guard-dispatch): refuse overlapping write scopes without a slice queue (enforce by default)` covering the protected diff; body: judgement runs in the spawned liveness script because a static import of the liveness lib from the hook breaks the module initialisation order (TDZ in project-onboarding-ready-gate).
2. unprotected: `refactor(dispatch-briefing): share the running-dispatch reader` + `test(dispatch-scope-overlap): pin the scope-overlap admission and the hook import cycle`.
AI-Assisted: true
Dispatch: K104-FANOUT-GUARD-LOAD-FAULT (goldfish)
