# State note, 2026-10-29 evening (installed budget, residual-acceptance and briefing-pointer candidate)

`docs/state.md` is at its hard size cap (29980 of 30000 bytes), so this note lives beside it until a rotation pass (`handover-rotate.mjs`, with the extraction review CLAUDE.md requires) makes room. It supersedes the figures in `docs/state.md` where they differ.

## What is installed

Four held patches were applied by the operator: `a7d9e7d45` (Critic delta rounds without a round or correction-commit cap), `c3898ac93` (PO acceptance of minor residual findings in the configured approval mode, chat or signature), `a57330be7` (briefing file pointer, D183), `88afb9b94` (Goldfish base budget 80 and 160, repeatable grants, `maxTurns` 400, resume-first notices, D191). Stamp `adc250283`, version `0.7.0+claude.20261029185738.88afb9b`. Installed by the PO; preflight read back `ready`, installed version equal, git hooks current.

## Cross-check of the committed stamp

22 touched suites in isolated clones: 19 green. Red and unchanged from before the patches: `parallel-work-in-one-checkout-is-unsafe` PARWORK-M6a/c/d/e/f; `guard-dispatch-budget.test.mjs` crashes in isolated clones (also at `9a8e83d5a`, 125 green when run directly in the checkout). Red and new: `guard-maintenance-window-kernel-closure` GMWKC01, because `lib/briefing-file-reference.mjs` is not yet a never-liftable kernel path. The fix is the held patch `w7-gmw-kernel-list-covers-briefing-file-reference-s2` (`138b2be57`, RED 10 of 11, GREEN 11 of 11); the PO decided it waits for the next local candidate, no stamp of its own.

## Open

- Live checks after the install: the runtime accepts `maxTurns` 400; a second `dispatch-budget-grant.mjs` grant of the same agent is accepted (no `grant-already-recorded`); a `promptPointer` dispatch delivers the expanded prompt.
- Toolbox diagnosis slice: the dispatch hooks do not emit `AUTHORITY-TRACE` yet (`evidence/windows-authority-trace-toolbox-2026-10-29.md`).
- push-prepare refusal sentence N13; enforcement rungs R1 to R5 of the budget-checkpoint item; `MAX_GRANT_ENTRIES` stays 20.
- Housekeeping: `2026-10-29-git-hook-runtime-snapshots-are-never-collected` and `2026-10-29-a-recurring-housekeeping-job-collects-growing-runtime-state`. The PO moved the unused hook snapshots aside (2.5 GB to about 300 MB).
- Full Verify, the batch Critic, native Windows runs, consumer retests and PO acceptance remain open.
