# w279: the budget checkpoint notice carries the exact grant line, and the grant script answers --help (candidate 20e, G20-73, AC-108)

Built by the Elephant (PO exception: small items) in the slice clone `scratch/agent-out/c20e` on top of w278. One clone
commit, one patch. Closest criterion: AC-108; PRD and Spec unchanged.

## Why

Measured in the Claude greenfield TabletApp_claude_070_3 (2026-11-08, 10:17Z): granting budget to a Critic that handed
back at its checkpoint cost the coordinator six calls: `dispatch-budget-grant.mjs --help` refused as an unknown
argument, a wildcard Glob for the script refused (GUARD-READ-TARGET), a Grep of the script source, then `--extra 40`
refused (grant-exceeds-headroom, remaining 9), then the grant of 9.

## What the patch changes

1. `lib/dispatch-budget-notice.mjs`: `grantCommandLine()` builds `node "<plugin root>/scripts/dispatch-budget-grant.mjs"
   --agent-id <id> --extra <remaining headroom> --reason "finish the remaining scope of the continuation card" --root
   "<root>"` (forward slashes); `checkpointNoticeText()` takes an optional `grantCommand` and tells the child to copy that
   line into its hand-back as `GRANT-COMMAND: ...`, or, when no headroom is left, to say `NO-GRANT-HEADROOM` so the
   dispatcher dispatches the remainder as a new task. Without the field the text is the prior one.
2. `hooks/guard-dispatch-budget.mjs`: computes the remaining headroom the grant script would accept
   (`dispatchGrantHeadroom(baseCalls, maxTurns) - grantedCalls`, 0 on the small-role lane) and passes the line.
3. `scripts/dispatch-budget-grant.mjs`: the CLI answers `--help`/`-h` with `GRANT_USAGE` (exit 0, grants nothing); the
   library entry still refuses `--help` as an unknown argument.

## Tests (QG-04)

`hooks/guard-dispatch-budget.test.mjs` ALF-G2B2 restated in place with a G20-73 comment (still a byte-identical
comparison of the whole notice, now including the grant line with headroom 24 for its binding). New assertions in the
existing case GDBC15 of `hooks/guard-dispatch-budget-checkpoint.test.mjs` (no new case id, so the case-completion
registry is unchanged): `--help`/`-h` usage, the Critic tier headroom 9 and its exact line with Windows paths, the
NO-GRANT-HEADROOM sentence, the prior text without the field.

## Evidence (clone, one suite at a time, private TMPDIR)

`hooks/guard-dispatch-budget.test.mjs` 125/127 (2 platform skips), `hooks/guard-dispatch-budget-checkpoint.test.mjs`
17/17, `hooks/guard-dispatch-budget-grant-notice.test.mjs` 16/16,
`lib/pins/budget-checkpoint-fires-below-the-briefed-cap.test.mjs` 11/11, `scripts/dispatch-briefing.test.mjs` 169/169.

## Not changed

The headroom bound itself (a Critic stays at most 59 working calls; agents/critic.md is in the Critic preimage pin; the
structural fix is the per-module split, package w281), the grant record format, the grant arrival rule.

## Not proven

A live child copying the line into its hand-back and the coordinator running it verbatim (next greenfield).
