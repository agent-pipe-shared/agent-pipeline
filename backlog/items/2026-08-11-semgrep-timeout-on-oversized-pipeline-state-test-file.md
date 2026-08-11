---
schema: pipeline.backlog-item.v1
id: pipeline.semgrep-timeout-oversized-pipeline-state-test
type: defect
owner: pipeline
status: closed
created: 2026-08-11
source: "Elephant session, 2026-08-11: node harness/scripts/security-scan.mjs turned BLOCKING (exit 2) for the first time this session after harness/scripts/pipeline-state.test.mjs grew to 4788 lines across many same-session dispatches."
---

# `security-scan.mjs` blocks on a semgrep per-rule TIMEOUT against the now-4700+-line `pipeline-state.test.mjs`, not a real finding

## Description

`node harness/scripts/security-scan.mjs` returned `BLOCKING` (exit 2) with
`semgrep: ERROR [scanner_error] (0 findings) -- semgrep JSON contains an
error payload`. Traced directly (running semgrep with the project's own
`governance/examples/policies/semgrep` rules against the working tree): the
raw semgrep JSON's `errors` array contains exactly one entry, `level: "warn"`,
`type: "Timeout"`, for rule `governance.examples.policies.semgrep.no-eval-usage`
against `harness/scripts/pipeline-state.test.mjs` — semgrep's own `results`
array is empty (zero matches, on everything it did finish analyzing).
`security-scan.mjs`'s adapter treats ANY non-empty `errors` array as a fatal
`scanner_error`, regardless of `level`, so a single rule timing out on one
oversized file blocks the whole gate exactly as hard as a genuine detected
vulnerability would.

This is a real, reproducible gate failure (confirmed by running the scan
twice), but the underlying cause is benign: `pipeline-state.test.mjs` grew to
4788 lines across many legitimate same-session test additions tonight
(P-AC-08/PX0 work), and semgrep's default per-rule timeout is too short for
its `no-eval-usage` pattern to finish analyzing a file that large.

## Triggering situation

Session ending 2026-08-11: `node harness/scripts/security-scan.mjs` had
returned `CLEAN` every prior run tonight; this is the first `BLOCKING`
result, immediately after the file's cumulative growth from many dispatches.

## Affected artifact

`harness/scripts/security-adapters/semgrep.mjs` (or wherever the adapter
maps a semgrep `errors[].level` to a fatal `scanner_error` — not yet located
precisely, this item is filed from the observed behavior, not a read of that
adapter's own source); `governance/examples/policies/semgrep`'s rule
definitions (timeout configuration); `harness/scripts/pipeline-state.test.mjs`
itself as the triggering file size.

## Proposal

Not investigated in depth (out of scope for the session that filed this).
Candidate directions, any of which plausibly resolves it: (a) raise the
semgrep per-rule/per-file timeout in the project's semgrep config; (b) have
the adapter distinguish `level: "warn"` timeout errors from genuine scan
failures, treating a timeout as a degraded-coverage warning rather than a
hard block (with the file/rule pair surfaced, not silently dropped); (c)
split `pipeline-state.test.mjs` into smaller files if its size is itself
undesirable for other reasons (a separate, larger conversation this item
does not attempt to resolve). Whichever direction is chosen, the fix should
be verified by re-running `node harness/scripts/security-scan.mjs` and
confirming a genuine `CLEAN` verdict, not just a suppressed error.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, fixed same session (option (a) from the Proposal).
- **Rationale:** `harness/scripts/security-adapters/semgrep.mjs` now passes
  explicit `--timeout 45 --timeout-threshold 0` to the semgrep invocation
  (commit `ba1a7d28`), giving semgrep's own per-rule budget headroom under
  the shared 60s outer subprocess timeout, and disabling the "skip after N
  timeouts" behavior that would otherwise leave a slow file's later rules
  unchecked. Verified: `node --test harness/scripts/security-adapters/semgrep.test.mjs`
  (11/11, no regression), then `node harness/scripts/security-scan.mjs`
  re-run twice against the committed candidate — genuine `CLEAN` both times,
  not a suppressed error (semgrep's own `results` and `errors` arrays both
  confirmed empty). Options (b) and (c) from the Proposal were not needed
  once (a) resolved it cleanly.
- **Assignment (if accepted):** done.
- **Date:** 2026-08-11.
