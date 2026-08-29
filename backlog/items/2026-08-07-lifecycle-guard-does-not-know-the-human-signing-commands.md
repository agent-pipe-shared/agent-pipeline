---
schema: pipeline.backlog-item.v1
id: pipeline.lifecycle-guard-does-not-know-the-human-signing-commands
type: defect
owner: pipeline
status: open
created: 2026-08-07
sprint: alfred
due: 2026-08-21
source: "Reported by the ONECMD-1 dispatch (2026-08-07) as an adjacent finding it deliberately left alone rather than fixing outside its briefed scope."
done_when: manual
---

# `guard-lifecycle-ready`'s human-signing list names only three of six commands

## Description

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` carries an
`isHumanPoSigningCommand` list used to recognise invocations that belong to the
human's terminal rather than to an in-session agent. It names `setup`,
`approve` and `approve-all`. It does not name `approve-critical`, `sign-intent`,
or the new `authorize-critical` — the three commands that actually reach the
signer today.

The list predates all three. `approve-critical` and `sign-intent` were added
later, and `authorize-critical` landed on 2026-08-07 with the one-command
ceremony (ADR-0061, `decbc61`). Nothing updated the list with them, and nothing
would have noticed: no check ties the guard's list to the CLI's actual
subcommand set, so the two drift silently and have.

## What this does and does not mean

State it precisely, because it is easy to overstate. This is **not** a hole
through which an agent obtains a signature: signing needs the encrypted private
key and its passphrase from a controlling terminal, which an in-session agent
does not have, and `po-approval-gate.mjs` — the agent-facing half — cannot reach
`authorize-critical` at all (pinned by a test in `po-human-approval.test.mjs`).
The trust boundary holds independently of this list.

What it means is that the lifecycle guard's classification of these commands is
wrong, so whatever it does with that classification — refuse, route, annotate —
does not happen for the three commands where it matters most. A guard whose
recognition list is stale is making a decision on an incorrect premise, and the
next change to what that classification controls will inherit the error.

## Triggering situation

Found by the ONECMD-1 Goldfish while adding `authorize-critical`, reading the
lifecycle guard to check whether the new subcommand needed registering there. It
reported the gap rather than fixing it, correctly: the fix is a guard change
outside its briefed file scope.

## Affected artifact

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (`isHumanPoSigningCommand`),
against `plugins/pipeline-core/scripts/po-human-approval.mjs`'s actual command set.

## Proposal

Not designed here. Two candidates, and the second is the one that matters:

1. Add the three missing names. Trivially correct, and it fixes today's instance.
2. **Derive the list from the CLI rather than restating it**, or add a check
   that fails when the guard's list and the CLI's parsed command set disagree.
   Restating a list in a second file is what produced this; fixing only the
   contents leaves the mechanism that caused it in place, and the same drift
   will recur with the next subcommand. This is the same shape as
   `2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md` — a
   registration that nothing forces to stay complete.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by Sprint Alfred. Verified
  live: `isHumanPoSigningCommand()`
  (`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:1221-1224`) still
  checks only `["setup", "approve", "approve-all"]` — `approve-critical`,
  `sign-intent` and `authorize-critical` remain unrecognised, exactly as
  reported. Not urgent (the item's own analysis holds: the trust boundary
  does not depend on this list, only the guard's classification does) and
  Direction #2 (derive the list from the CLI's actual command set instead of
  hand-restating it, so it cannot drift again) is exactly "mechanical
  governance, measurable rigor" — Alfred's scope description verbatim.
- **Rationale:** verified the stale list directly; deferred rather than
  fixed now because the trivial 3-name patch (Direction #1) would just
  re-create the drift risk Direction #2 exists to close, and Direction #2 is
  design-shaped Alfred-track work, not an urgent gap.
- **Assignment (if accepted):** next available Alfred slot.
- **Date:** 2026-08-17

### Note, 2026-08-19 (Wave 5 round 1, dispatch NVA-W5-06)

Direction #1 (the trivial 3-name patch) was implemented anyway in this
dispatch, despite this item's own 2026-08-17 Rationale explicitly
arguing against doing #1 alone ("would just re-create the drift risk
Direction #2 exists to close"). This is a process deviation worth
flagging plainly: this item was categorized as Alfred-scoped and should
not have been in the Wave-5-round-1 batch. The landed change itself is
harmless and tested (`guard-lifecycle-ready.test.mjs` 115/115 pass,
`isHumanPoSigningCommand()` now recognizes 6 of 6:
`setup`/`approve`/`approve-all`/`approve-critical`/
`authorize-critical`/`sign-intent`) and does not need to be reverted —
but it does not substitute for Direction #2 (deriving the list from the
CLI's actual command set, or a drift-detection check), which remains
genuinely deferred to Sprint Alfred and is the reason this item's
`status:` stays **open**.
