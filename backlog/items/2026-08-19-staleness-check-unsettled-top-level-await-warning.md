---
schema: pipeline.backlog-item.v1
id: pipeline.staleness-check-unsettled-top-level-await-warning
type: defect
owner: pipeline
status: closed
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

- **Decision:** accepted, dispatched (`NVA-BL-STALEAWAIT-1`, goldfish-implementor,
  worktree-isolated).
- **Date:** 2026-08-19

## Closure, 2026-08-19

Root cause confirmed by empirical probe, not the Proposal's own
speculation: `inspectPipelineUpdateAvailability()`'s implementation is
fully synchronous (fs sync calls + `spawnSync`), not a Promise-race
pattern. `spawnSync`'s default `killSignal` is `SIGTERM`, which a stuck
`git` child (e.g. `ls-remote`/`fetch` against a hung remote) can trap or
otherwise ignore — the call then blocks until the child's own natural
exit instead of settling near the stated `timeoutMs`, which is exactly
the observed "unsettled top-level await" symptom (the whole call chain
is synchronous, so a blocked `spawnSync` blocks the awaiting function
too). Fixed by passing `killSignal: "SIGKILL"` (uncatchable) to the
`spawnSync` call in `plugins/pipeline-core/scripts/ruleset-freshness.mjs`.

New permanent regression test injects a SIGTERM-ignoring child via
`options.spawn` and asserts settlement near `timeoutMs`: RED (3037ms,
failed the <1000ms assertion) before the fix, GREEN (238ms) after.
Commit `5161abb6` (cherry-picked from the dispatch's worktree, commit
`e47ed1ab`). Full module suite: 15/15 pass. `check-consumer-safe-paths.test.mjs`:
9/9 pass.

**Deliberately not done:** no independent Critic review has run yet for
this diff. Implementation complete; Critic review and PO acceptance
pending.

Item closed.
