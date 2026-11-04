# w208: the recorded stop-failure reason reaches the plan, the build warning and the notice (E1)

Found by the second Windows consumer run of candidate 19c (2026-11-04): w207 records WHY the stop could not read its pending host-commit state (`NGHS-PENDING-MISSING: ENOENT ... lstat <path>`), but only the PostToolUse hook text showed it. `goldfish-host-commit-recover.mjs plan` and the `dispatch-briefing.mjs build` warning `DBG-HOST-COMMIT-STOP-FAILURE` dropped it, and the hook text still said the cause was "the normal case for a background launch", which is the PostToolUse case, not a stop.

## Change

- `plugins/pipeline-core/scripts/goldfish-host-commit-recover.mjs`: `stopFailureCause(record)` returns the bounded, already scrubbed `reason` (the detail's own `reason` when the record has none), `stage` and `detail`; `newestStopFailure` and the plan's `stopFailure` carry them. A record without a cause adds no field, so the plan digest and the existing `{ file, code }` equality are unchanged for it.
- `plugins/pipeline-core/scripts/dispatch-briefing.mjs`: the warning line ends with `stage S, reason R` or `no reason recorded`; control characters are removed and the text is bounded to 160 characters per field.
- `plugins/pipeline-core/hooks/native-goldfish-host.mjs`: the notice for `NGHF-PENDING-UNAVAILABLE` says "at its stop the child's pending host-commit state could not be read", adds "(this record carries no reason; it may predate the reason field)" only when there is none, and no longer calls the case normal.

## Tests

- `goldfish-host-commit-recover.test.mjs`: a plan carries reason and stage; reason from `detail.reason`; a bare record adds no cause fields.
- `dispatch-briefing.test.mjs`: the warning names stage and reason, the detail's reason, "no reason recorded", and stays one bounded line.
- `native-goldfish-host-finalizer-regression.test.mjs` NGHF08 restated (the old pin asserted the wrong cause for a stop record; QG-04, the logic is kept).
- `guard-dispatch.test.mjs` GD75b: an admitted pointer prompt leaves the same pending state as the inline briefing (Linux; the corpus count 82 becomes 83). It rules the pointer prompt out as the cause of the missing pending state on Windows.

## Result in the work clone

recover plan and dispatch-briefing and finalizer regression: 177/177; neighbouring suites (finalizer, host commit admission, host commit execution, the SubagentStop pin): 104/104; guard-dispatch: 83/83.

## Reading of the same run (not fixed here)

Probes 4 and 5 left NO pending state and no reservation, the registry lock of a dead pid stayed for more than ten minutes, and `guard-dispatch` was seen running for more than 8 minutes while its hook timeout is 330 s. The pointer prompt is not the difference (all five probes used it; GD75b is green on Linux). The consistent reading is that the admission was cut off by the hook timeout while it held the lock and before it wrote the pending state, after which the launch went on unguarded. The cause of the length is the per-file PowerShell start of the Windows authority checks: `specs/sprint-alfred-epic/plans/windows-authority-latency-plan-2026-11-04.md`.
