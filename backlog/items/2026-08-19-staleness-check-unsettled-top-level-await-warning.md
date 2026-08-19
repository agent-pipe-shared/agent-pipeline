---
schema: pipeline.backlog-item.v1
id: pipeline.staleness-check-unsettled-top-level-await-warning
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "PO, live, 2026-08-19: same session transcript as the greenfield ask-before-install-duty item, terminal output: 'SessionStart:startup hook error / Failed with non-blocking status code: Warning: Detected unsettled top-level await at file:///.../plugins/pipeline-core/hooks/staleness-check.mjs:208'."
---

# staleness-check.mjs SessionStart hook logs an unsettled top-level await warning

## Description

A live Claude Code session's `SessionStart:startup` hook run printed:
"Failed with non-blocking status code: Warning: Detected unsettled
top-level await at file:///.../plugins/pipeline-core/hooks/staleness-check.mjs:208".
Non-blocking (the session continued normally), but a real observed defect.

Line 208 in this checkout is `await run();`, a top-level await gated by
`isDirectInvocation(import.meta.url)` -- valid ESM syntax by itself. `run()`
(lines 194-205) already wraps its inner await in try/catch, so a REJECTION
from `inspectSessionStartUpdateAvailability()` is caught. A promise that
never settles (neither resolves nor rejects) would NOT be caught by that
try/catch and would leave the top-level await pending until the host
(Claude Code's own hook-execution timeout) kills the process -- which
matches an "unsettled top-level await" warning at forced teardown.

`inspectSessionStartUpdateAvailability()` (lines 176-192) delegates to
`ruleset-freshness.mjs`'s `inspectPipelineUpdateAvailability()`, passing a
`timeoutMs` option -- implying that function is expected to internally
bound its own work. Not yet investigated: whether that internal timeout
mechanism reliably resolves/rejects the promise it guards, or whether it
can itself hang (e.g. a bare `setTimeout` that never fires under some
condition, or a network/filesystem call with no effective bound).

## Proposal

Read `ruleset-freshness.mjs`'s `inspectPipelineUpdateAvailability()` and
confirm its timeout path actually settles the returned promise in every
code path (including whatever operation it's timing) rather than merely
scheduling a callback that races the real work without a guaranteed
resolution. Add a regression test that simulates the slow/hanging
condition and asserts the function settles within its stated `timeoutMs`.

## Triage

Not yet triaged.
