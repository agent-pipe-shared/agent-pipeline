# Held patch w7-ac175d: an Antigravity transcript export may name only its own conversation (AC-175 follow-up)

Built by the Elephant under the PO exception for small items (2026-10-30), in
`scratch/agent-out/w7agyd/clone` (edited) and `clone2` (plain). Both clones
stack AC-175b and AC-175c on db1e4f2be. Held for candidate 13; apply it after
AC-175c.

## Why

AC-175c hands the host context to the CLI export through a file named after
the conversation id in `--session-id`. The hook writes that file only when
both ids equal the envelope's own conversation. The CLI, however, consumes
the file the command names. A second Antigravity conversation on the same
machine and repository could therefore consume the first conversation's
unconsumed handoff within its five-minute life, by running the byte-identical
command with the first conversation's id. The AC-175c notes name this
residual risk.

## What the patch changes

`hooks/antigravity-pretool-guard.mjs`: a new export,
`foreignAntigravityExportReason`, runs at the final admit step, before the
handoff writer. It refuses a sanctioned `runner-transcript-recovery.mjs
export --runner antigravity` whose `--session-id` or `--exclude-session`
differs from the envelope's conversation id, with
`AGY-EXPORT-FOREIGN-CONVERSATION`. The refusal names the ids to use.

These cases are unaffected:
- other runners;
- other operations;
- the own conversation;
- calls without a host context (nothing to compare; the CLI still answers
  `antigravity-host-context-unavailable`).

## Tests

- New hook case (AC-175D): three foreign-id shapes are denied with the code
  and with the own id named, a foreign conversation's handoff file stays
  untouched, a Codex export naming the other id is still allowed, and the own
  conversation is still allowed.
- The existing AC-175C case "writes no handoff for another conversation ..."
  stays green: those calls are now denied, so they still write nothing.

## Evidence (logs in scratch/agent-out/w7agyd)

- red1: the new case fails on the stacked candidate, and the other 71 pass.
- c1: antigravity-pretool-guard 72/72, runner-transcript-recovery 32/32,
  current-session-artifact-export 7/7, cross-runner 4/4.
- Revert proof: with the hook reverted, exactly the new case fails;
  restored byte-equal true.
- c2: VCR01 shows only the six count mismatches the baseline already has.

## Callers

The hook's own main is the only caller. The text appears only in the
Antigravity runner. Claude and Codex have no handoff and no change.

## Residual

Without a host context the hook cannot compare ids. That case already yields
`antigravity-host-context-unavailable` at the CLI, unless a stale foreign
handoff exists and an envelope without host fields runs the export. The
handoff lifetime (five minutes) and the sweep bound this. A live
Antigravity envelope run is still unverified.

## Open

Full Verify, batch Critic, a native Antigravity run and PO acceptance stay
pending.
