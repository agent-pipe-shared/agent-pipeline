# W7 N25: architecture-map currency is asked early (held patch notes)

Slice `W7-N25-ARCHITECTURE-CURRENCY-EARLY-20261030`, candidate `8ea0e787bdf9b2cafca4b609cb80aa93d9b8ee3f`.
Patch: `w7-n25-architecture-currency-early.patch` (applies to the plain candidate; built only in prepared clones).
Decision applied: D208 (no relief; early check through the one function; every refusal names contract, concept map, step).

## What the patch does

1. `lib/architecture-push-currency.mjs` gains one shared formatter next to the check:
   `describeArchitectureCurrencyRefusal(currency)` returns `{ reason, remedy, staleContracts, lines }`,
   `formatArchitectureCurrencyRefusal(currency)` returns the lines, `architectureMapSanctionedStep(staleContracts)` the step text.
   Stale text: `N declared public contract(s) changed after their concept map:`, one `  - <contract> (concept map: <target>)` line per
   contract, then `Sanctioned step: update the concept map in <target(s)> so it covers the contract change, commit it, then rebuild the
   candidate before Critic/Verify (a stale map stays stale whatever the change was: comment-only changes are not exempt).`
   `ok:false` keeps the old single `Reason: ...` line.
2. `hooks/guard-push.mjs`: the final refusal (lines ~2260-2270 only, plus the import) prints the formatter lines after the
   unchanged header `BLOCKED (guard-push architecture map): final candidate needs a current architecture map.` The guard still
   refuses on `!ok || stale`; nothing is weakened.
3. `scripts/push-init.mjs` (`drivePushInit`): new seam `inspectArchitectureCurrency` (default: HEAD resolved with the real `spawnSync`,
   then `inspectArchitecturePushCurrency`, the ONE function). Placed after the S-bound reconciliation early return and before
   `pushPrepareReport`, so the HEAD-bound architecture failure joins the R-bound checks and keeps `foldPendingApprovalWrite` off
   (approval preparation cannot commit onto a candidate that must be rebuilt). A stale map is a failed check
   `{ id: "architecture-map-currency", status: "architecture-map-stale", message (contracts + concept maps), remedy (step), staleContracts }`,
   carried into `recovery.blockers`; a current adopted map records the step `architecture-map-currency` ok; a never-adopted repository
   adds neither check nor step. The retry action is the unchanged push-init argv (no new dead end, no circle).
4. `scripts/critic-dispatch-preflight.mjs`: refuses `CDP-ARCHITECTURE-MAP-STALE` (details: `reason`, `staleContracts`, `repair`) through the same
   function, after the inventory/manifest/governance/spec readbacks and before evidence is read, so no packet is prepared.

## Decisions a reviewer should look at

- HEAD, not `--candidate`: push-init asks about the commit that is pushed (record commit R = HEAD), exactly what guard-push inspects.
  `--candidate` is the substantive commit S of the reconciliation and may predate the map commit.
- Only the STALE verdict is an early failure in push-init and in the preflight. A structurally unverifiable map (`ok:false`, for example a
  scaffold map with index and inventory but no concept) stays the final guard's refusal. Reason: the existing push-init lifecycle case
  ("baseline-only implementation ... proceeds after its exact apply action", fixture = greenfield scaffold map, no concept) expects
  `signature-required`; QG-04 forbids weakening it, and D208 names the stale map. Open question for the Coordinator/PO: should unverifiable
  states also refuse early (that needs that fixture to carry a concept)? Not done here.
- A root whose HEAD does not resolve (non-git fixture roots in the existing push-init suite) is `applicable:false`, not a failed check: there is
  no candidate to inspect; the final guard is unchanged. Not a D208 relief.
- Preflight placement after the readbacks, not at candidate resolution: the existing case "injected Git failures cover partial candidate
  inventory manifest governance and candidate-read branches" injects on the first `ls-tree` and expects exactly one injection; an earlier
  `ls-tree` would consume it (QG-04, cannot edit). Cost: a candidate with no manifest/spec is refused for that reason first.
- No relief (D208): the anchor uses a comment-only contract change; it stays stale. A map-only commit refreshes the map and is the sanctioned step.
- Test honesty: the lib anchor's "preflight is not an architecture refusal after a map commit" half passes because the preflight then
  stops on the absent evidence file; the real green half (`packet-ready` after the map commit, with comment-only change stale before) is
  the preflight suite case CDPF071. The lib file's never-adopted preflight call is vacuous (stops on the missing manifest); the
  never-adopted preflight path is genuinely covered by the 70 pre-existing preflight cases running on a map-less fixture.
- The guard-level text is pinned through the shared formatter cases; `hooks/guard-push-architecture.test.mjs` (outside the write scope) only
  matches the unchanged header, so a follow-up assertion there that the contract path appears in stderr would pin the guard line itself.
- Revert proof (production files reverted to the candidate, test files kept, then restored byte-equal): lib formatter case and ANCHOR red;
  push-init stale-map case red; preflight CDPF071 red. The push-init "only the stale verdict is an early check" case passes without
  production, by design: it pins non-regression for unverifiable and never-adopted maps.
- Callers of the shared function and their pins: guard-push final refusal (guard-push-architecture suite, header; text via the lib
  formatter cases), push-init (push-init suite N25 cases + lib ANCHOR), Critic preflight (CDPF071 + lib ANCHOR). Unaffected, same
  results clone vs baseline: critic-course-admission, critic-diagnostic-evidence, session-critic-finalizer, observe-critic-preflight,
  codex-critic-host, codex-isolated-critic-contract, push-prepare, guard-lifecycle-ready, push-release-flow-docs-contract,
  pipeline-state-inspect, architecture-fitness. guard-push.test.mjs has the same 22 pre-existing failing names in both.
- Verify integration (wanted point 1, "if feasible in Verify") is NOT done: it would edit `harness/scripts/verify.mjs` (protected, TP-3) and is
  outside the write scope.
