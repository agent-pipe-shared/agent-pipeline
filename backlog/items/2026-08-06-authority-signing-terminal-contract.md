---
schema: pipeline.backlog-item.v1
id: pipeline.authority-signing-terminal-contract
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-06
source: Phoenix §7 authority revision; approve step failed twice inside an agent session
---

# Make the human-only signing step self-documenting and non-interactive-safe

## Description

The §7 authority-revision approval helper signs the intent digest by invoking
`openssl pkeyutl -sign -rawin -inkey <private-key>` with inherited stdio and no
passphrase source. When the private key is passphrase-protected — which it
should be — OpenSSL opens the controlling terminal directly to prompt. An agent
session has no controlling terminal, so the step fails with a key-loading error
that names neither the real cause nor the required environment.

The failure is correct in outcome: an agent must not be able to exercise the
Product Owner's signing key. It is wrong in ergonomics. Nothing in the helper's
usage line, the skill documentation, or the operator guidance states that this
one command is human-only and requires a real terminal, so the natural next
action is to retry it in the same non-interactive context.

This is a workflow-improvement input. It must not weaken the key boundary: the
passphrase itself must never be accepted through argv, an environment variable,
or any channel an agent session can observe or persist.

## Triggering situation

Two consecutive approval attempts inside an agent session failed with
`pkeyutl: Error loading key` after the passphrase prompt could not be read. No
signature, proof, or partial artifact was produced, and the prepared request
survived both attempts intact, so a later retry in a real terminal remains
valid.

## Affected artifact

The authority approval helper's `approve` command, its usage text, and the
operator-facing signing documentation.

## Proposal

State the human-only terminal requirement in the helper's own usage output and
in the operator guidance, and fail with a typed, self-explaining error when no
controlling terminal is available rather than surfacing a raw OpenSSL decode
error.

Additionally accept an optional pass-through for OpenSSL's passphrase *source
specification* — the `file:` and `fd:` forms only — so an operator can sign from
a non-interactive but still human-controlled context without exposing the
passphrase. Reject the `pass:` and `env:` forms explicitly, because both would
place the secret where an agent session can read it. Keep the default behaviour
unchanged: no source specified means the interactive terminal prompt.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
