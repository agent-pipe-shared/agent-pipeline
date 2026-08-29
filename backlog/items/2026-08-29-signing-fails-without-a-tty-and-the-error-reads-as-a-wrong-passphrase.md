---
schema: pipeline.backlog-item.v1
id: pipeline.signing-fails-without-a-tty-and-the-error-reads-as-a-wrong-passphrase
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains plugins/pipeline-core/scripts/po-human-approval.mjs pipeline.signing-requires-attended-terminal
source: "Live PO signature ceremony, 2026-08-29: sign-intent invoked through the session's `!` command route failed with an OpenSSL 'while reading strings' error that reads as a rejected passphrase; the PO re-ran the identical command in a separate terminal and it succeeded on the first try."
---

# Signing fails without a TTY, and the error reads as a wrong passphrase

## What happened

During a live signature ceremony the PO ran `sign-intent` through the route
this session had handed him — the interactive `!` prefix, which executes the
command inside the agent session rather than in an attended terminal. OpenSSL
failed with an error about *reading strings*. The visible outcome is
indistinguishable from mistyping the passphrase on a key you rarely use.

Nothing had been mistyped and nothing was burned. The command needs a
controlling terminal to run its own passphrase prompt, and the `!` route does
not provide one. The PO re-ran the identical command in a real terminal
window and it succeeded immediately.

## Why this matters more than an ordinary papercut

The external-key signature is the one irreducibly manual act in this
operating model — the PO's acceptance bar allows five human touches, and two
of them are signing. A failure mode that makes a *correct* passphrase look
*wrong* attacks exactly that step, and its natural reaction — "I must have
the wrong key" — sends the human to the key directory rather than to a second
terminal window. There is a standing memory in this project recording that
the OneDrive key is canonical and the old WSL copy is a different key
precisely because that confusion has cost time before.

## Where it is

`plugins/pipeline-core/scripts/po-human-approval.mjs`:

- `signIntentIntoProof()` (line ~946) spawns
  `openssl pkeyutl -sign -rawin -inkey <key> …`, which prompts for the key
  passphrase itself.
- `command()` (line 597) spawns with `stdio: "inherit"` and, on any non-zero
  exit, raises the single generic message
  `openssl failed; the human terminal must complete the local prompt`.

That message is not wrong — it names the terminal — but it arrives *after*
OpenSSL's own noise, which is what the reader anchors on. More importantly it
is emitted **after** the attempt: nothing checks the precondition before
spawning, so the human experiences a failed signature rather than a refused
start.

## Proposal

Fail closed *before* spawning OpenSSL, with a typed message that names the
cause and the remedy in the same sentence:

- Check for a controlling terminal (`process.stdin.isTTY`) at the top of the
  signing step, and refuse with a distinct, greppable message — something of
  the shape "this step needs an attended terminal: OpenSSL prompts for the
  key passphrase on the TTY, and this process has none. Run the identical
  command in a terminal window." Never mention the passphrase being wrong.
- Place a `pipeline.signing-requires-attended-terminal` marker at that check.
- Have the emitted ceremony instructions say up front that the signing step
  — and only that step — must be run in an attended terminal, so the agent
  handing over the command does not offer the `!` route for it. The three
  digest-computation steps before it are pure computation and are unaffected.

Deliberately out of scope: reading, supplying, caching or scripting the
passphrase in any form. This file's own header documents that the attended
OpenSSL prompt is never scripted, and that must not change.

## Acceptance

- Invoking the signing step with no controlling terminal refuses before any
  OpenSSL spawn, with the typed message above.
- A test covers the no-TTY branch and asserts the message does not contain
  the word "passphrase" in a way that implies it was rejected.
- The ceremony instruction text names the attended-terminal requirement for
  the signing step.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** cheap, mechanically testable, and it protects the single
  human act the whole authorization model rests on. Observed live, not
  hypothesised.
- **Assignment:** `sprint: nova`. Not a candidate blocker on its own — the
  ceremony does work from an attended terminal — but it belongs in the same
  pass as the other ceremony-ergonomics item filed the same day.
- **Date:** 2026-08-29
