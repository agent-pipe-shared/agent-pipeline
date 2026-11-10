# C28 held patch: a Goldfish host commit survives an Elephant commit and its lost steps can be recovered

Slice `C28-HOST-COMMIT-RECOVERY`. Closest criterion: AC-108. PRD and Spec unchanged. Built in the clone of the candidate 28 integration state
(`17eae99a4`), saved as `c28-host-commit-recovery.patch`. Nothing was committed in the real checkout. The patch is cut against the clone base, not the
real HEAD (`apply --check` on the real HEAD names `commit-pipeline-owned.mjs` and its test: the other candidate 28 patches stack on those files first).

## What

PO decision 2026-11-10 by tile on the WSL greenfield report (candidate 27): 3 of 13 host commits failed, in three classes.

1. **A commit while a Goldfish runs warns (and refuses once inside its scope).** New `lib/running-goldfish-scope.mjs` reads the host-commit pending states
   tolerantly: a claude or codex dispatch younger than 6 h whose stop has not ended (no stop outcome other than a checkpoint, no stop-failure record, no dispatch
   record) is "running"; its scope is the write scope plus the check and dependency paths. Both callers use that one function:
   - `hooks/guard-git.mjs` (new block after GG-22, for every `git commit` whose message the guard can read). `guard-git` is what `hooks.json` (Claude),
     `codex-pretool-guard.mjs` and `antigravity-pretool-guard.mjs` all run, so all three runners are covered by one wiring. A commit inside a running dispatch's
     scope exits 2 with the dispatch id, the scope, the risk (its host commit fails with `SDC-AUTHORITY-UNAVAILABLE`, recovered with
     `goldfish-host-commit-recover.mjs`) and the override. A commit outside every scope exits 1 with the same warning on stderr. The dispatch's own commit
     (`Dispatch: <id> (goldfish)`) is never held against it.
   - `scripts/commit-pipeline-owned.mjs`, which runs git from Node and so passes no Bash guard: same check on the owned and carried paths; refusal code
     `CPO-RUNNING-GOLDFISH`, result field `warnings` otherwise.
   **Override form (chosen here):** the Elephant's own acknowledgement, no PO signature: the message ends with a `Concurrent-Goldfish: <dispatchId>` trailer line
   (guard), or `--acknowledge-goldfish <dispatchId>` (the command, which then writes that same trailer). The commit itself records that the Elephant knew.
   "Refused once" is read statelessly: refused whenever the acknowledgement is absent, never a stored one-shot counter.
2. **Recovery by one idempotent command.** `scripts/goldfish-host-commit-recover.mjs` (existing route, extended; no new flag, so the guard's argv admission is unchanged):
   - HEAD that moved **forward** from the pending candidate (what the host commit refuses as `native-concurrent-advance-touches-scope`) no longer refuses
     `GHCR-HEAD-MOVED`; `plan` reports `headAdvance {from, to, touchesScope, scopePaths}` and plans on the advanced HEAD. A HEAD that does not descend from the
     candidate still refuses.
   - The commit exists, the record after it was lost (`NGHF-CRITIC-PATH-DISPOSITION` and the other post-commit stages): `plan` says `mode: "record-only"`, `apply` writes
     the typed record for exactly that commit (status `recorded`) and commits nothing. The commit is found by its own `Dispatch: <id> (goldfish)` trailer between the
     candidate and HEAD.
   - A second run says `already-recovered` (exit 0) and changes nothing, on both routes (the ordinary route used to answer `GHCR-NO-CHANGES` / `GHCR-RECORD-EXISTS`).
   - **The failure text names it.** `hooks/native-goldfish-host.mjs`: every failed host commit (an authority refusal `SDC-AUTHORITY-UNAVAILABLE`, `NGHF-AUTHORITY-RECOVERY`,
     `NGHF-COMMIT-FAILED`, `NGHF-CRITIC-PATH-DISPOSITION`, `NGHF-RECORD-INVALID` and every `NGHF-<STAGE>-EXCEPTION`), at the stop and in the later stop-failure notice, gets the
     recovery sentence; with the root and the dispatch id known (`root:` option, the stop's `stopDispatchId`) it carries the complete command
     (`node '<plugin>/scripts/goldfish-host-commit-recover.mjs' plan --root '<root>' --dispatch-id <id> --briefing scratch/briefing-<id>.md --handback scratch/handback-<id>.txt`),
     says when the host commit already exists, and says a second run is safe. The old placeholder sentence stays for callers that pass no root.
3. **Hints bound to their dispatch.** `readNativeGoldfishStopFailure` gains `strict`: no dispatch id, no hint; no fallback to the newest record of another
   dispatch; no `others`; and a record is dropped once that dispatch's stop later ended with a recorded host commit. The PostToolUse call site uses it. The default
   reader (the recovery helper's) is unchanged. `clearNativeGoldfishStopFailures` (extracted from the stop's own success clean-up) is also called by the recovery
   command when it has landed a result or finds it already landed.

Failure classes: (1) a commit while a dispatch runs: the guard and the Pipeline's own commit command; (2) lost post-commit steps: the authority refusal at commit and at terminal prepare, every post-commit stage
exception, an invalid record, the Critic path disposition: one recovery text, one record-only route; (3) hints: the stale fallback, `others`, a null dispatch id, and clearing on success, recovery and already-recovered.

## Proof

Test-first: the cases were written and run red against the original code before the first production edit, in registered suites (no new test file).

| Suite | Cases | RED against the original | GREEN |
|---|---|---|---|
| `scripts/orchestrator-commit-record.test.mjs` | RHC-1 concurrent advance (real Git: Elephant commit inside the scope, pending state, plan, apply, apply again), RHC-2 disposition (commit exists, record-only, twice), RHC-3 ordinary route twice, RHC-4 every code names the command, RHC-5 strict hints and clearing, RHC-6 hint cleared by apply | tests 16, pass 10, fail 6 | tests 16, pass 16, fail 0 |
| `lib/native-goldfish-host-stop-pair.test.mjs` | NGSP2R: the real stop refuses `native-concurrent-advance-touches-scope`, its text names the command, the command recovers from the real pending state, twice | tests 16, pass 15, fail 1 | see report |
| `hooks/guard-git-gg22.test.mjs` | RGC-1..7 (real Git, real guard process: refuse, bare commit, acknowledgement, outside scope, own commit, stale pending, ended by record) | 5 of 7 red (RGC-6 and RGC-7 are the no-regression controls) | pass 1/1 |
| `scripts/commit-pipeline-owned.test.mjs` | refusal once with the dispatch named, acknowledgement trailer, outside-scope warning | tests 9, pass 7, fail 2 | tests 9, pass 9, fail 0 |
| `lib/guard-maintenance-window-kernel-closure.test.mjs` | unchanged (GMWKC01/03) | n/a | tests 1, pass 1 |

The guard cases live in the GG-22 suite because it already owns the real-Git guard fixtures and is registered; `guard-git.test.mjs` is protected.

## Not changed

- `scripts/finish-feature.mjs` also commits from Node (the close commit). It is another Goldfish's file in this candidate; the same two calls
  (`runningGoldfishCommitNotice` before its commit, `acknowledged` trailers in its message) belong there. Reported, not built.
- The pending state, the authority member and the item delivery of a recovered dispatch are not closed by this command. The orchestrator-attested record it writes is what
  `scanOrchestratorCommitIntegration` already reads to integrate the slice at the next admission; whether a left-over registry member then needs `routine-repair.mjs run heal`
  is the open "member stays armed after a stopped slice" finding, not touched here. The v4 writer still refuses a record without host observation (no check weakened; the
  record stays labelled `orchestrator-attested`, `hostObserved: false`).
- `hooks.json`, `guard-git.test.mjs`, the Critic preimage files, `plugins/pipeline-core/roles/elephant.md` (not checked as a byte-pinned mirror, so left alone), PRD and Spec.
- `guard-git.mjs` is not a kernel path (`lib/guard-maintenance-window.mjs`), so the new lib needs no `NEVER_LIFTABLE_KERNEL_PATHS` entry; GMWKC01/03 stay green.
- No new gate, no PO signature, no change to the guard's argv admission for the recovery command.

## Not proven

- A live Claude, Codex or Antigravity session: the guard wiring is read from `hooks.json`, `codex-pretool-guard.mjs` and `antigravity-pretool-guard.mjs`; only the guard process was run with real Git.
- The exit-1 warning channel: a PreToolUse exit 1 prints stderr to the user; whether the model sees it is the runner's behaviour. The refusal (exit 2) is always shown to the model.
- A foreground (PostToolUse-route) Goldfish writes no stop outcome, so it counts as running until its dispatch record exists or six hours pass.
- Native Windows: spawns use argv arrays (`process.execPath` where node is spawned); not run on Windows.
- Suites beyond the table were not re-run for this hand-back: see the report for which ones ran green and which did not run.
