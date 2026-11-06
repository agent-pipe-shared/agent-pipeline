# w248: heal moves a stale armed member aside without a human, and move-aside admits what heal recommends

Elephant-built (2026-11-06, candidate 19k; PO: a fix of a few lines is built by the Elephant, and "move-aside should be a heal function an agent runs on its own").

## Found

- `routine-repair run heal` deferred the retirement of settled pending states whenever a producer reported an armed member (`lib/routine-repair.mjs`, `deferredSettledPending`). A member left armed by a cut-off dispatch stays armed for ever, so the deferral never ended; its text named `routine-repair run move-aside --no-goldfish-running` as the way out.
- That move-aside then refused `RR-OUTSIDE-LIST` for an open item reservation (`classifyInspectFindings` adds `open-item-reservation:<slice>`), and with nothing else wrong it refused "no blocking finding". A refusal recommended a command that itself refused: against the never-fully-blocking rule. Live on Linux 2026-11-06 (19j), cleared only through `session-authority-repair move-aside` after a manual slice cancel.

## What it changes

- `heal` accepts `--no-goldfish-running` (CLI and plan). With it, an armed member no longer defers: heal moves the registry aside (retained, nothing deleted), re-inspects, retires the settled pending states and stop-failure records on the fresh namespace, then runs its delegate heal. Without it heal still defers and names exactly `routine-repair run heal --no-goldfish-running`.
- `move-aside` ignores open item reservations (it never touches them) and admits the case "only a member left armed".
- The closed list's `heal` and `move-aside` usage and descriptions say so.

## Checks (clone at a45ad68f1, 19j applied)

- `plugins/pipeline-core/lib/routine-repair.test.mjs`: 47/47.
- `git apply --check` against the repository: exit 0.

## New case ids (`plugins/pipeline-core/lib/routine-repair.test.mjs`)

- C19K-W248-1 heal --no-goldfish-running with an armed member moves aside, retires and heals.
- C19K-W248-2 without the flag heal still defers and moves nothing (a running Goldfish is never disturbed).
- C19K-W248-3 move-aside is not refused for an open reservation; an armed member alone is moved aside; nothing at all is still refused.
- C19K-W248-4 the CLI admits the flag for heal and move-aside only.
- Restated in place (QG-04): the C19 deferral test now asserts the new way-out command with the same strictness (a runnable command, exact form).

## Not changed, not proven

- No automatic detection of "no Goldfish runs": the agent asserts it with the flag, as for move-aside (D203 unchanged).
- The D194 closed list keeps its five kinds; only two kinds widen. No Windows run.
