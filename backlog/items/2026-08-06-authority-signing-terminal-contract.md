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

## Product Owner disposition

Signing outside the agent session is **intended behaviour and must stay**. The
passphrase prompt is what keeps the credential out of the session's reach; an
agent that could satisfy it would hold the signing authority it exists to be
denied. The problem is therefore purely one of explanation, not of access.

This supersedes the original draft of this item, which also proposed a
pass-through for OpenSSL's passphrase source specification. Even the restricted
`file:` and `fd:` forms move the secret closer to a context the session can
observe, for a convenience gain that does not justify eroding the one boundary
that demonstrably held. Do not implement it.

## Proposal

State the human-only terminal requirement in the helper's own usage output and
in the operator guidance, so the requirement is discoverable before the first
attempt rather than after it.

Fail with a typed, self-explaining error when no controlling terminal is
available — naming the cause and the required environment — instead of
surfacing a raw OpenSSL decode error that reads like a corrupt key.

Keep the passphrase interactive and terminal-bound. Accept no argument,
environment variable, file, or descriptor as a passphrase source.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
