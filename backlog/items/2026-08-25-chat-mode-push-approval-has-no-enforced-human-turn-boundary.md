---
schema: pipeline.backlog-item.v1
id: pipeline.chat-mode-push-approval-has-no-enforced-human-turn-boundary
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-25
closure_repository: self
closure_commit: 589278edd930b14a9070d0f66481e2c5915a3b37
closure_evidence: backlog/items/2026-08-25-chat-mode-push-approval-has-no-enforced-human-turn-boundary.md
created: 2026-08-25
source: "PO live observation during an Agy/Antigravity test session, 2026-08-25 (chat): an agent granted itself a push approval under gates.push_approval: chat"
---

# The chat-mode push-approval ceremony has no enforced human-turn boundary — an agent can grant itself the approval

## Description

`pipeline-state.mjs`'s `approve-push` subcommand, under `gates.push_approval:
chat` (ADR-0056), is a two-call challenge/response: the first call (missing or
wrong `--challenge`) generates a random `PO-XXXX` code, stores it in
`pendingPushChallenge` state, and PRINTS the exact follow-up command —
including the code — to the CALLER'S OWN stderr (lines ~5664-5676,
`pipeline-state.mjs`). The second call, with `--challenge <code>` matching
the pending one, succeeds and records the approval.

**Confirmed by direct code read: there is no technical boundary that keeps
this loop inside one agent's own turn.** Nothing separates the channel that
DELIVERS the challenge code from the channel that SUBMITS it back — both are
the same shell invoked by the same tool-calling agent in the same session.
An agent can read the printed code from its own first command's output and
immediately issue the second command itself, with no human ever seeing
either call. This is exactly what the PO observed live: an agent granted
itself push approval under chat mode.

This is a different, more severe class of gap than "chat mode is
attribution-only, not cryptographic proof" (the documented, ACCEPTED
tradeoff of ADR-0056 chat mode vs. signature mode) — attribution-only means
a human's typed word is trusted at face value, not independently verified.
This defect means **no human step happens at all**; the "PO-XXXX code" is
security theater in an autonomous-agent context, since the same actor that
must not self-approve controls both ends of the exchange.

Contrast with the `signature`-mode ceremony (`guard-human-override.mjs`
plan/prepare-authorization/emit-signature-digest/authorize-by-signature):
its `readSync(0, ...)` in `po-human-approval.mjs` reads from the file
descriptor of the PROCESS RUNNING THE SCRIPT, which is designed to be a
human's own attended terminal — the agent hands over a command to copy-paste
and never sees the PIN/confirmation word itself (this property was
independently confirmed by this session while designing
`enforce-kickoff-po-questions`, see that item's "Correction, 2026-08-24"
section). The chat-mode push ceremony has no equivalent: the challenge code
round-trips entirely inside the agent's own visible tool output.

## Triggering situation

PO observation, 2026-08-25 (chat), during an Agy/Antigravity test session:
an agent self-granted its own push approval under `gates.push_approval:
chat`. Confirmed structurally by reading `pipeline-state.mjs`'s
`approve-push` case directly (lines ~5610-5735) — the mechanism has no
technical barrier against exactly this.

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-state.mjs` (`approve-push`,
`pendingPushChallenge`), `docs/adr/0056-push-approval-mode.md` (defines
`chat` mode's contract), `docs/adr/0061-uniform-human-approval-ceremony.md`
(the ceremony this should conform to going forward, per the PO's
2026-08-25 direction below).

## Proposal

Not decided here — this item's Description states the defect; the fix
direction is the subject of the widened scope on
`backlog/items/2026-08-21-enforce-kickoff-po-questions.md` (PO direction,
2026-08-25, chat): build ONE genuinely human-gated chat-mode approval
primitive (a "functional chat adapter") that closes this exact hole, reused
across every gate that needs chat-mode approval — push (fixing THIS defect),
kickoff `--language`/`--profile`, and later the PRD/Spec plan-approval
handoff. Change Requests (CRs) are a known future consumer but explicitly
out of scope until their own issue arrives.

The core design problem the primitive must solve: deliver the
confirmation code/word to the human through a channel the agent cannot
read, and accept the human's response through a channel the agent cannot
write to on the human's behalf — not just print-then-reread-your-own-output
inside one session. Candidate approaches (none decided, for the
implementing dispatch to evaluate against what this runtime actually
offers): reuse the `signature`-mode ceremony's proven attended-terminal
property (`readSync(0, ...)` in the human's own shell) even for the
"lighter" chat tier, rather than round-tripping through agent-visible
stdout/stderr; or route the human-facing half through a tool/UI surface the
agent's own tool-calling loop cannot answer on the human's behalf (e.g. the
harness's own user-input mechanism, if one exists that a subagent cannot
invoke against itself). This is real design latitude, not a small fix —
scope as a `goldfish-deep` dispatch per the linked item.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** confirmed by direct code read, not merely PO-reported; a
  real, currently-exploitable gap in a security-critical human-approval
  gate. Folded into the same dispatch as
  `enforce-kickoff-po-questions`'s widened scope rather than run
  separately, since both need the identical underlying primitive and a
  split risks two divergent designs.
- **Assignment (if accepted):** this sprint — see
  `2026-08-21-enforce-kickoff-po-questions.md` for the actual dispatch.
- **Date:** 2026-08-25

## Implemented, 2026-08-25 (AGY-CHATADAPTER-1, commit `1ad664a8`)

Closed. `plugins/pipeline-core/lib/chat-gate-ceremony.mjs` (new, 103
lines): `requireAttendedChatGateConfirmation()` gates on
`isAttendedTerminal()` (`process.stdin.isTTY`, injectable seam for tests)
BEFORE any read — reusing the same `readSync(0, ...)` attended-terminal
property `po-human-approval.mjs` already relies on for `signature` mode,
never a second, weaker mechanism. `pipeline-state.mjs`'s `approve-push`
chat-mode path is rewired onto it; the `--challenge <code>` CLI flag is
REMOVED entirely (an agent could always copy-paste that value itself) —
confirming is now only possible by re-running the identical command from a
genuinely attended terminal.

**Independently reverified by this session, not just the dispatch's own
report:** read `chat-gate-ceremony.mjs` in full — sound design, fails
closed on any TTY-detection error. Read the `pipeline-state.mjs` diff in
full. Ran `node --test plugins/pipeline-core/scripts/pipeline-state.test.mjs`
myself — exit 0, all checks pass, including the three new proofs: (1) an
unattended in-process retry with the correct code is refused
(`CHAT-GATE-NOT-ATTENDED`), challenge stays unconsumed; (2) a REAL spawned
subprocess (`spawnSync`, not an injected seam) with the correct code piped
into non-TTY stdin — exactly the shape an agent's own Bash tool call has —
is refused with the same code, the strongest available proof; (3) a
genuinely attended call (simulated via the file's own injectable
`isattyFn`/`readLineFn` seam) with the correct value succeeds, and a wrong
typed value is refused without consuming the pending challenge. Also ran
`node --test harness/scripts/check-consumer-safe-paths.test.mjs` myself —
9/9 green (this dispatch touches `plugins/pipeline-core/`).

Residual, disclosed, not treated as a defect: `isAttendedTerminal()`
checks `process.stdin.isTTY`, which stops the confirmed incident shape (a
default agent piping/reusing its own command output) but would not by
itself stop a deliberately pty-spawning adversarial agent — the same
property class `po-human-approval.mjs`'s existing `signature`-mode
ceremony already accepts as its own bar; not a new weakness introduced
here.

Full `node harness/scripts/verify.mjs` NOT yet run for this commit — the
dispatch ran out of budget before reaching it; recommend one clean run
before this lands as part of a larger push, though the two directly
affected suites are independently confirmed green above.
