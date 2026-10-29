# Windows authority trace, Toolbox machine, 2026-10-29

First real measurement of the diagnosis slice (`PIPELINE_AUTHORITY_TRACE`, `PIPELINE_AUTHORITY_NO_MEMO`) on the Toolbox Windows machine, run by the PO in PowerShell on the installed build. Command: `pipeline-state.mjs reopen-design --dry-run` in the consumer checkout (no path or name recorded here). The two trace lines are verbatim; the wall clock is PowerShell `Measure-Command`.

## Raw lines

With the memo (default):

```
AUTHORITY-TRACE {"schema":"pipeline.authority-trace.v1","elapsedMs":2768,"custodyInspections":{"count":2,"ms":149,"maxMs":80},"nativeObservations":{"count":5,"ms":2425,"maxMs":985,"failed":0,"byOperation":{"inspect":2,"publish":1,"read":1,"remove":1}},"authorityMemo":{"hits":1,"misses":3,"size":0},"outcome":"ok"}
wall clock 3159.6 ms
```

With `PIPELINE_AUTHORITY_NO_MEMO=1`:

```
AUTHORITY-TRACE {"schema":"pipeline.authority-trace.v1","elapsedMs":2743,"custodyInspections":{"count":2,"ms":149,"maxMs":81},"nativeObservations":{"count":6,"ms":2412,"maxMs":667,"failed":0,"byOperation":{"inspect":2,"publish":1,"read":2,"remove":1}},"authorityMemo":{"hits":0,"misses":0,"size":0},"outcome":"ok"}
wall clock 3078.3 ms
```

## Reading

| | memo on | memo off |
| --- | --- | --- |
| elapsed in the command | 2768 ms | 2743 ms |
| native observations | 5 calls, 2425 ms (87.6 % of elapsed) | 6 calls, 2412 ms (87.9 %) |
| average per native call | about 485 ms | about 402 ms |
| slowest native call | 985 ms | 667 ms |
| custody inspections | 2 calls, 149 ms | 2 calls, 149 ms |
| memo | 1 hit, 3 misses | off |
| wall clock | 3.16 s | 3.08 s |

1. The time is the native observations: about 88 % of the command, one external PowerShell process per call at roughly 0.4 to 0.5 s each. Custody inspection (149 ms) and the rest are small. This confirms the cause recorded as "one PowerShell per operation".
2. The memo as built does not help here. It removed one `read` (five calls instead of six) but the total native time is the same within noise (2425 ms against 2412 ms), and elapsed and wall clock did not move. One hit in four lookups is too little to matter on a single command.
3. The operations are `inspect` x2, `publish`, `read` x1 to 2 and `remove`. A `publish` followed by a `remove` in a `--dry-run` looks like a create-and-delete probe; whether a dry run needs it is the first thing to check in the code. Fewer spawns per command (one helper process for the operations of a command, or no write probe in a read-only path) is the lever; a bigger memo is not.
4. This command takes about 3 s, not minutes. The "minutes" symptom is the PreToolUse step of an Agent dispatch, a different process: four hook processes, each with its own authority work. At about 0.45 s per native call, minutes means on the order of a hundred calls or contention, which this measurement can neither show nor exclude.
5. The report of 2026-10-28 measured about 3 min 18 s for the same command on an earlier build. This build takes about 3 s, and still does with the memo switched off, so the memo is not what removed the minutes; which earlier change did is not established by this measurement.
6. The trace switch is read only in `pipeline-state.mjs`; none of the hooks emits it. So the dispatch hooks are not yet measurable with this switch.

## Consequence for the work

- E2 (memo) alone will not remove the wait; do not report it as the fix.
- Next slice: let the dispatch hooks (at least `guard-dispatch`, the item-queue admission and the native-host preparation) emit the same trace line when `PIPELINE_AUTHORITY_TRACE` is set, then take one measurement of a real Agent dispatch in the consumer. Only that run tells whether the minutes come from the number of native calls or from lock contention.
- Second slice, after that measurement: the cheapest reduction of spawns (batching, or dropping the write probe from read-only paths).
- Matrix row `pipeline.agent-dispatch-pretooluse-step-takes-minutes-in-a-consumer` stays at 25: the state-command trace is measured, the dispatch hook is not.
