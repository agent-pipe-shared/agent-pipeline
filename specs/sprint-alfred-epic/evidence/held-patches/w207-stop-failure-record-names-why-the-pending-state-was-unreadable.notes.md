# w207 — the stop-failure record names why the pending state could not be read (E1 diagnostic; candidate 19c)

PO decision 2026-11-04: build the E1 diagnostic now instead of waiting for stage 2.

## Why

On the Windows consumer (stage 1 baseline, `evidence/windows-consumer-probe-stage1-baseline-result.md`) `goldfish-host-commit-recover.mjs plan` reports no pending host-commit state while a stop-failure record with `NGHF-PENDING-UNAVAILABLE` is on record. `readNativeGoldfishPending` answers every read failure with one code (`NGHS-PENDING-MISSING`) and the underlying error as `reason`, and the SubagentStop path dropped that reason: a pending state that was never written and one that exists but could not be read (private-path check, a Windows ACL or `WIN-AUTH-*` fault) produced the same record. Stage 2 (a live dispatch) could not run on the consumer: the briefing generator needs an acceptance criterion in the approved Spec and a probe dispatch has none (a foreign `AC-n` would be a false binding, a hand-written briefing is forbidden). So the next real background dispatch on Windows is the measurement, and this change makes it say which of the two causes it was.

## Change

`lib/native-goldfish-host-finalizer.mjs`: `readSubagentStopPending` returns a `reason` with `NGHF-PENDING-UNAVAILABLE`: the read failure code plus the underlying error message, scrubbed by the existing `boundedErrorMessage` (every path-like token becomes `<path>`, at most 160 printable characters). The unresolved-stop record writer stores it in its `reason` field (the field existed and was always `null` for this variant). `scripts/goldfish-host-commit-recover.mjs`: the `stopFailure` object of the plan output carries the `reason` when the record has one. The hook message already prints a record's `reason` when present. Diagnostic only: no admission, no verdict and no code changes; the record keeps its schema.

## Evidence (work clone on the rehearsed chain)

- `native-goldfish-host-finalizer.test.mjs` 48/48: NGHF29 now also stops a marked Goldfish whose meta file resolves to a tool use id with no pending state, and asserts the record's code `NGHF-PENDING-UNAVAILABLE`, a `reason` starting with `NGHS-PENDING-MISSING`, at most 200 characters, no host path anywhere in the record, and no commit.
- `goldfish-host-commit-recover.test.mjs` and `claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs` 28/28, `native-goldfish-host-commit-execution.test.mjs` 7/7.

## What this does not prove

It does not say WHICH cause the Windows runs have; it makes the next failing Windows dispatch say so in `plan`'s `stopFailure.reason` and in the hook message. A reason of `NGHS-PENDING-MISSING: ENOENT ...` means the state was never written (look at the PreToolUse step); a path or ACL reason means it exists but is unreadable (look at the private-path check).
