# Routine repair settled-pending-aside (W7, Goldfish slice W7-SETTLED-PENDING-ASIDE-20261030)

Held patch `w7-settled-pending-aside.patch`, built in a scratch clone at candidate 597b52b77. Nothing applied; the PO applies it in the bundled ceremony.

## Behaviour

- New fifth closed-list kind `settled-pending-aside` (`routine-repair.mjs run settled-pending-aside --root <root> --reason "<why>"`).
  It delegates classification to the reservation rows of `session-authority-repair inspect` (the settled rule is not re-implemented): a pending
  file whose row is settled `integrated`, `integrated-by-commit` or `cancelled` moves under
  `agent-pipeline/session-authority-abandoned/<stamp>-<hex>-settled-pending/`, with the `authority-terminal-<sha>.json` and
  `authority-integration-<sha>.json` of the same digest when present. The sha256 of the pending bytes is recomputed and must equal the name.
  Settled null, status unreadable, symlinks (also a symlinked sibling) and digest mismatches stay and are listed in `keptPending` with a reason.
- Afterwards the existing `moveStopFailuresAside` runs over the current diagnostics directory into the same aside directory. Nothing is deleted.
- `heal` runs the same step BEFORE its delegate (inspect, retire, then `session-authority-repair heal`) and reports it as `settledPending`.
  Deviation from the briefing wording ("after the delegate"): moving files after heal would leave the native-goldfish producer baseline stale
  (namespace drift) until the next heal; before-heal lets the delegate re-anchor on the namespace as it stays. It costs one extra inspect call.
- `dispatch-briefing.mjs` (generator and build) calls the exported read-only `readSettledPendingPreview` (routine-repair.mjs; one inspect spawn,
  no writes). With settled pending states or leaving stop-failure records it adds `preDispatch: [{kind:'routine-repair', argv:[node, <plugin>/scripts/routine-repair.mjs, run, heal, --root, <root>, --reason, ...], why}]`
  and replaces the DBG-HOST-COMMIT-STOP-FAILURE warnings of those dispatches by one `DBG-SETTLED-PENDING-HEAL` warning. Nothing is run by build.

## Reader check (before any edit)

Non-test readers of pending files: `native-goldfish-host-state.mjs` (reads pending by exact session/correlation key and Codex start binding of
`agentId === null` pending states; a settled one is never a start candidate), `native-managed-authority-support.mjs` (the inventory classifier;
no cross-file orphan check), `dispatch-briefing.mjs` `defaultStartedOwners` (counts only pending files WITHOUT authority-terminal whose slice is
`ready` and has no Dispatch trailer; cancelled and integrated-by-commit are excluded by its own filters), `session-authority-repair.mjs`
(reservationReport itself), `routine-repair.mjs`. None needs a settled pending file for a later decision that I could find. Not exhaustively
traced: `inspectNativeGoldfishItemDelivery` / delivery history through the registry producer members (it did not match the pending-file pattern).

## Open points

- Sibling files `authority-owner-`, `authority-check-`, `authority-scope-`, `authority-recheck-`, `authority-checkpoint-` of a retired digest stay
  (the briefing names only terminal and integration). The inventory classifier has no orphan check, so they do not refuse; they still count.
- The standalone kind changes the native namespace outside the registry boundary; run `heal` afterwards if inspect reports namespace drift
  (heal itself orders it correctly).
- A pending file that is unreadable or a symlink also keeps every stop-failure record (existing `moveStopFailuresAside` behaviour, unchanged).
- No case-id pin file exists in `harness/config` (rg found no `routine-repair` there); the suite is pinned by name in `harness/verify-suites.json`
  (protected TP-13, not touched). Existing heal table row now expects `inspect` before `heal`; list assertions now name five kinds.
- Not run: Full Verify, Critic, a run against a real `.git`, Windows.

## Evidence (scratch/agent-out/w7pendaside logs, driver.mjs)

- Clone (patched): routine-repair.test.mjs tests 25 pass 25 fail 0; dispatch-briefing.test.mjs tests 116 pass 116 fail 0.
- Baseline (plain candidate): routine-repair.test.mjs 20/20; dispatch-briefing.test.mjs 114/114.
- Revert proof (production files at candidate, new tests kept): routine-repair 8 failing (heal row, five new cases, list, CLI list),
  dispatch-briefing 1 failing (the preDispatch case); production restored byte-equal.
- Patch: 5 files, 291 insertions, 9 deletions; `git apply --check` on the plain candidate exit 0.
- session-authority-repair.test.mjs: clone 38/40 and baseline 38/40; the same two cases fail in both (SAS05 SAD diag (5) and SAS18 authority trace (1), PIPELINE_AUTHORITY_TRACE line count 2 vs 1), so they pre-exist and are not caused by this patch.
