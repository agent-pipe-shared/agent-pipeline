# D197: the lifecycle guard admits the closed routine-repair argv shapes (held patch, 2026-10-30)

Held patch `w7-d197-guard-admits-the-routine-repair-shapes.patch`, built in a scratch clone at cf80f8243. Nothing applied.

## Behaviour

`lib/guard/command-catalogue.mjs` gains `sanctionedRoutineRepairArgs`, reached from `sanctionedLifecycleScriptArgs` for the plugin's own
resolved `scripts/routine-repair.mjs` (physical path compare, as for the resume-hint script; a same-named script elsewhere is a different
program and stays refused). Because the non-ready branch of the lifecycle gate ends in `isSanctionedLifecycleCommand`, one admission
covers PORG-NOT-READY, PORG-INVALID-OBSERVATION and PORG-OBSERVATION-UNAVAILABLE. Admitted exact argv: `list`; `run heal|stop-failure-aside|
settled-pending-aside --root <root> --reason <value>`; `run move-aside ... --no-goldfish-running`; `run slice-cancel <id> ... --class
budget|integrated-elsewhere [--started]`. Flag order free, each flag once, no other flag or positional, root equal to the guard root, reason
non-empty, single line, at most 500 characters.

## Already present in the candidate (no production change needed)

- The verb already refuses an empty or multi-line `--reason` (`RR-REASON-REQUIRED`) and appends one ledger line per run (`lib/routine-repair.mjs`).
  The briefing asked for `RR-ARGS` if missing; it was not missing, so `scripts/routine-repair.mjs` is untouched.
- D203 (reconcile-refused after heal is moved aside, other findings refused) is already implemented and pinned in `routine-repair.test.mjs`.
  Pinned additionally for the observed `native-authority-orphan-prefix` case in the guard suite.

## Evidence (clone, driver logs)

- RED before the production edit: 3 admitted-shape cases failed (one per lifecycle state). This is the revert proof (production file was the original).
- GREEN: D197 cases 9/9.
- Clone: guard-lifecycle-ready 423 tests, 420 pass, 0 fail, 3 skipped; routine-repair 30/30; approved-lifecycle-state pin 5/5.
- Baseline (plain candidate): guard-lifecycle-ready 414 tests, 411 pass, 0 fail, 3 skipped; routine-repair 30/30; pin 5/5. Difference: the 9 new cases.
- Apply-check on the plain candidate: exit 0.

## Not verified

Full Verify, Critic, PO acceptance, the live consumer run, Windows. The new cases sit in the existing registered guard suite (no new file).
