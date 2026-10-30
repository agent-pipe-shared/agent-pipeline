# W7-D197-ROUTINE-REPAIR-R2: the routine-repair verb with the closed list (D194, D197)

Held patch `w7-d197-routine-repair-closed-list.patch`, built only in scratch clones against candidate 463fa9a14. Nothing committed, nothing applied.

## Behaviour as built

- `plugins/pipeline-core/lib/routine-repair.mjs` (runner-neutral core): `ROUTINE_REPAIRS` (deep-frozen, four kinds), `planRoutineRepair`, `runRoutineRepair`, `classifyInspectFindings`, and the shared rule `moveStopFailuresAside`.
- `plugins/pipeline-core/scripts/routine-repair.mjs` (thin CLI): exactly `list` (read-only JSON of the closed list) and `run <kind> --root <root> --reason "<one line>" [flags]`.
- Kinds: `heal` (delegates to session-authority-repair heal); `slice-cancel <id> --class <budget|integrated-elsewhere> [--started]` (delegates to slice-queue cancel; any other class: RR-OUTSIDE-LIST); `stop-failure-aside` (new repair); `move-aside --no-goldfish-running` (delegates only when `inspect` reports nothing but `unknown-registry-entry` / `native-managed-unknown-native-entry`; any other finding, or no finding: RR-OUTSIDE-LIST naming it).
- Ledger: every run whose repository resolves appends one line to `<git-common-dir>/agent-pipeline/routine-repair-ledger.jsonl`: `{schema:"pipeline.routine-repair-record.v1", kind, reason, at, result, moved:[{from,to}], retained:[...]}`, paths relative to the common dir. Refusals are recorded too (reason null when missing).
- Refusals: kind not in the list: `RR-OUTSIDE-LIST` with next step "this repair is decided by the human; the original tool's own command: ..."; no/blank reason: `RR-REASON-REQUIRED`; also RR-ARGS, RR-ROOT, RR-INSPECT-FAILED, RR-LEDGER-FAILED. Exit 0 done, 2 refused.
- Nothing is deleted: the only filesystem mutation of the new repair is `renameSync` into `session-authority-abandoned/<timestamp>-<random>-stop-failure/`.
- Stop-failure rule: where the pending state of the CURRENT namespace lives: `run/native-goldfish-host-commit` (pending-<runner>-<64 hex>.json, settled by authority-terminal-<sha256 of pending bytes>.json), the same directory the legacy rule reads; the diagnostics themselves are in the sibling `run/native-goldfish-host-diagnostics`. The rule is factored into the lib with `sourceDir` and `pendingDir`; `session-authority-repair.mjs` `retireLegacyStopFailures` now delegates to it (same directory for both: behaviour unchanged, its suite has the same failing names as baseline). Never a symlink, only a valid stop-failure.v1 record, never an unsettled or unreadable-pending dispatch.
- Default calibration: the list itself, for every repository; no `pipeline.user.yaml` key added.

## Files in the patch

- new `lib/routine-repair.mjs`, `lib/routine-repair.test.mjs`, `scripts/routine-repair.mjs`
- `scripts/session-authority-repair.mjs`: imports the shared rule, drops the copied body and the now unused `lstatSync`/`renameSync` imports
- `harness/verify-suites.json`: one entry `routine-repair-tests` (REGISTERED; this file is TP-13 protected, so the PO's apply ceremony must acknowledge it)

## Cases (one shared table, real temporary git repository under the clone's scratch)

heal; slice-cancel budget (with --started); slice-cancel integrated-elsewhere; stop-failure-aside; move-aside for each of the two findings. Refusals: kind outside list (release-lock), unknown kind, wrong cancel class, missing reason, blank reason, move-aside with another finding, with one allowed plus one other, with no finding. Every table row also asserts the ledger line (shape, relative paths) and that no file was deleted. Separate cases: stop-failure record moved aside; unsettled pending kept then moved once settled; symlink, other-schema and malformed record kept; list frozen with exactly four kinds; finding classifier; CLI end to end (list, outside-list, missing reason, real run, ledger). Delegated tools (heal, cancel, inspect, move-aside) are a recording stub; stop-failure-aside and the ledger are real.

## Evidence (finished logs, clone vs clone2 baseline)

- New suite in clone: 20 tests, pass 20, fail 0 (before and after the no-op proof; final state run `c2`).
- `session-authority-repair.test.mjs`: clone and clone2 both exit 1 with the same two failing names: SAS05 (PIPELINE_AUTHORITY_TRACE one trace line) and SAS18 (authority trace authorityMemo). Baseline reds, not caused by this patch; the clone has none that clone2 lacks (also re-run on the final state, same two).
- `slice-queue.test.mjs`: 20/20 in both. `check-suite-registration.test.mjs`: 32/32 in both.
- No-op proof: with `moveStopFailuresAside` returning at once, the new suite fails 5 tests (`stop-failure-aside` table row, the three stop-failure cases, the CLI case); restored byte-wise by reversing the one inserted line, new suite green again.
- `driver patch`: patch written, `git apply --check` in the plain clone2 exit 0.

## Guard finding (D197) - NOT resolved, needs the PO/Elephant

The briefed `rg` over `lib/guard/command-catalogue.mjs` and `lib/guard/shell-grammar.mjs` found no generic rule admitting `node <plugin-root>/scripts/*.mjs`. Admission there is per exact script (resume-hint, repair-map, readiness scripts, each one exact argv shape); `session-authority-repair.mjs` and `slice-queue.mjs` are not named in either file or in `guard-lifecycle-ready.mjs`, so how a ready session admits them was not found within budget. Therefore it is NOT shown that `routine-repair.mjs list|run` is admitted. No guard change is in the patch (kernel path outside the write scope). If refused, the needed change is exactly two argv shapes in `command-catalogue.mjs`: `node <plugin-root>/scripts/routine-repair.mjs list` (args length 1) and `node <plugin-root>/scripts/routine-repair.mjs run <kind> ...` with `--root <this root>` and `--reason`, plus its test.

## Deviations

- Test-first order not kept: lib and CLI were written before the test file, so there is no RED run against original code; the no-op proof is the substitute.
- Delegation uses `spawnSync(process.execPath, ...)` with `shell:false` (no shell) rather than in the same process: the scripts import the lib (shared stop-failure rule), so importing them from the lib would create an import cycle. `deps.spawn` is the test seam.
- `heal` delegation does not pass the reason (heal has no such flag); the reason lives in the ledger.

## Not verified

Codex and Antigravity adapters (the core is runner-neutral, no adapter was written or run), Windows (rename and path handling untested there), real `heal`/`slice-queue cancel`/`move-aside` end to end through the new verb (stubbed; each has its own suite), the finding-text matching against a real `native-managed-unknown-native-entry` registry (matched on code and reason text of `inspect`; fixture is synthetic), Full Verify, Critic, PO acceptance.

## Continuation card

Done: lib, CLI, test, registration, shared rule, patch (apply-checked). Remaining: guard admission decision (above); optional in-process delegation; real-registry fixture for move-aside findings. Next step: PO applies the patch in the bundled ceremony (verify-suites.json acknowledged), Elephant decides the guard shapes.
