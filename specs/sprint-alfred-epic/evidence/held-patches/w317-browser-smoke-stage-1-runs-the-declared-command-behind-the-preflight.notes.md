# w317 — stage 1 of the browser smoke in Verify: the declared `browser-smoke` command runs behind the preflight (candidate 31, lane M7)

The patch is a delta on the base clone of candidate 31 (it edits the same producer files). Apply the base clone first, then this patch; it does NOT apply to the real checkout alone (an `apply --check` against the real checkout exits 1 by design).
Source: `plans/browser-smoke-in-verify-options-2026-11-18.md` (B1, PO release 2026-11-18, decisions 1, 3 and 8 taken, the others at their defaults). Criterion binding: AC-112 is the closest existing accepted criterion; it concerns an unrelated item. The PRD and the Spec are unchanged and no new criterion is claimed.

## What it adds

- `plugins/pipeline-core/scripts/browser-smoke-check.mjs`: a new dispatcher (own file, like `architecture-boundary-check.mjs`; exports `runConsumerVerifyCheck`). It reads the configuration with `readConsumerVerifyConfiguration`, finds the entry with the reserved id `browser-smoke` and:
  - no entry: `browser smoke: not applicable`, exit 0;
  - `preflightBrowserEvidence({requiredEvidence:"browser-e2e"})` not ready: exit 1, the command is NOT run; the log names the typed `BEP-*` code, `no browser test ran; this is not a product failure`, `browser verification pending` and exactly one `human step:` line per state (package missing, browser missing, host library missing, launch failed; any other state names the preflight command to run). The Pipeline still installs and downloads nothing;
  - preflight ready: the command runs like `consumer-verify-check.mjs` (`spawnSync`, shell, inherited stdio); a non-zero exit prints `browser smoke failed` and returns the command's own code.
- `verify-evidence-producer.mjs`: one helper `configuredSuite` builds the `project-<id>` suites; the id `browser-smoke` gets `[BROWSER_SMOKE_DISPATCHER, "browser-smoke"]`, every other id keeps the consumer dispatcher. Step name, selection, areas, evidence and `verifyRun` shapes are unchanged.
- `docs/usage.md`: two sentences in the `verifyImpact` paragraph: the id is reserved, Playwright and Chromium are what stage 1 supports, a project already using the id is told to rename it.
- Tests (marker-file commands only, no real browser):
  - `verify-evidence-producer.test.mjs` (registered suite, 63 of 63): no `browser-smoke` means no step (characterization, green first); declared without a browser is red with the code, the pending words, the human step and the marker file ABSENT (red before the change: the command ran); area selection by paths only, and a selected entry is still behind the preflight.
  - `browser-smoke-check.test.mjs` (new, 9 cases): not applicable; ready and exit 0; ready and exit 7 says `browser smoke failed` and nothing of the unavailable text; table-driven over the five preflight states (one human step each, command never run); unknown check and unreadable configuration refused.

## Checks

- Targeted: `verify-evidence-producer.test.mjs` 63 of 63; `toolchain-preflight.test.mjs` 59 of 59; `browser-smoke-check.test.mjs` 9 of 9; this patch's own check (`w317-*.check.test.mjs`).
- Neighbours, one at a time: `browser-evidence-preflight.test.mjs` 7/7, `consumer-baseline-verify.test.mjs` 1/1, `verify-selection.test.mjs` 1/1, `verify-resume.test.mjs` 17/17, `scoped-verify-registration.test.mjs` 1/1. `verify-journal.test.mjs` has two red cases (`domain-ancestor-unsafe` in the clone's temp directory), identical on the base clone: not this change.
- `guard-maintenance-window-kernel-closure.test.mjs` (GMWKC01) is red with 8 violations on the base clone and with this change alike (a `routine-repair.mjs` spawn-edge shape); this change adds none.

## Findings the PO should know

- `plugins/pipeline-core/lib/guard-maintenance-window.mjs` is NOT edited. The list at lines 684-701 is `NEVER_LIFTABLE_KERNEL_PATHS`, the transitive closure of the kernel files' imports and spawn edges (GMWKC01). Only kernel files can pull a script in; the producer is not a kernel entry and `consumer-verify-check.mjs` (which is) does not import the new dispatcher, exactly like `architecture-boundary-check.mjs` and `security-close-check.mjs`, which are not listed either. `browser-evidence-preflight.mjs` was already listed. The implementation digest of the consumer adapter covers the whole package, so receipts are bound without a list edit.
- `toolchain-preflight.test.mjs` is NOT edited, deliberately: its cases carry ids `TCP001..TCP059` declared as an explicit list in `harness/config/verify-case-completion-augmentations.v1.json` (append-only registration, outside this write scope). A new `check()` would add an undeclared id. The six cases of the options document sit instead in the producer suite (producer level) and in the new unit file (dispatcher level).
- REGISTRATION (PO step): `plugins/pipeline-core/scripts/browser-smoke-check.test.mjs` is a new test file and does not run in Verify until it is registered in `harness/verify-suites.json` (protected) and in the case-completion config if that suite should carry case ids.

## Not changed / not proven

- No stage 2, 3 or 4, no new calibration field, no new result kind, no gate; the unavailable result stays a non-zero (red) step. A project that declares the smoke on a runner without a browser ends in a red Verify and does not reach the acceptance question; the recovery is the human step and a rerun.
- Case 5 of the options document says "always in release mode": release mode needs a Critic claim, so it is not run here; the registry for release mode is the same `configuredSuite` output and the selection code is untouched.
- The wording of the install commands per package manager is the npm form. A real Playwright launch was never run. The Critic is suspended by the PO for this repository's candidates and no Full Verify ran: this change is verified by tests only.
