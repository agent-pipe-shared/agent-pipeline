---
schema: pipeline.backlog-item.v1
id: pipeline.a-runner-improvised-the-po-signature-instructions
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: nightwing
source: "Recorded 2026-08-27 from a PO-pasted transcript of an Antigravity session against a separate repository — a transcript the PO pasted, not something reproduced live in this session."
---

# A runner improvised the PO's signature instructions, and nothing constrains what an agent may print as a ceremony command

## Description

Two distinct errors occurred in one signing ceremony hand-off. First, the
agent gave the PO a **repository-relative** path
(`plugins/pipeline-core/scripts/...`) for a command the PO had to run in a
DIFFERENT repository, where that path does not exist. Second, having no
working command, it then invented one — a `sign-digest` subcommand — and
told the PO it might not exist.

The real interface is `po-human-approval.mjs sign-intent --repo-root
<repo> --directory <key-dir> --intent-sha256 <sha>`. `sign-digest` is not
among that script's `KNOWN_COMMANDS`.

## Triggering situation

Recorded 2026-08-27 from a PO-pasted transcript of an Antigravity session
against a separate repository. Provenance note: this item is filed from
that pasted transcript; the dispatcher did not reproduce or re-verify it.

## Why this matters more than an ordinary wrong command

A signing ceremony is exactly the step where the human cannot check the
agent's work — the whole point is that the human contributes a secret the
agent must not see. An invented command trains the PO either to give up on
the ceremony or to run whatever is printed. Both outcomes damage the
control the ceremony exists to provide.

## A related, separately observed hazard

The same script resolves its key directory from `--directory`, then an
environment variable, then a machine-plane setting. On 2026-08-27 an
omitted `--directory` silently resolved to a superseded key directory
holding a DIFFERENT key, and the ceremony failed afterwards with
`PO-APPROVAL-TRUST-MISMATCH` — a live PO passphrase entry spent for
nothing. Any fix for improvised instructions should also make the resolved
directory visible in what the agent prints.

## Affected artifact

- `plugins/pipeline-core/scripts/po-human-approval.mjs` (`sign-intent`,
  `KNOWN_COMMANDS`, key-directory resolution order)
- whatever guard or script currently hands a ceremony command to an agent
  to relay to the PO

## Proposal

Options, not a decision:

1. The guard or the script emits the exact ceremony command as a
   structured, copy-safe action the agent must relay verbatim, the way
   `restartCopyCommands` already works elsewhere in this codebase — an
   agent that must relay cannot invent.
2. A check that refuses to print a ceremony command naming a subcommand
   outside `KNOWN_COMMANDS`.
3. Documentation only, which is what exists now and is what failed.

This repository already solved the identical class once with a
verbatim-relay rule, so the fix shape (option 1) is known rather than
novel.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, option 1 (structured verbatim-relay action), with
  option 2 as a cheap additional backstop
- **Rationale:** A ceremony command is the one place the human cannot check the
  agent's work, because the whole design has the human contribute a secret the
  agent must not see. That makes "the agent composed this from memory" a control
  failure, not a typo. The fix shape is not novel in this repository: the same
  class was already closed once with a verbatim-relay rule, and
  `restartCopyCommands` is a working implementation of exactly that pattern
  (bounded, copy-safe, emitted by the tool rather than retyped by the agent).
  The attached key-directory hazard is accepted as part of the same package
  rather than split off: an omitted `--directory` silently resolving to a
  superseded key directory already cost one live PO passphrase entry, and a
  relay action that printed the RESOLVED directory would have shown it. A relay
  that is verbatim but silent about which key it will use solves half the item.
  Provenance is recorded honestly in the item and does not change the verdict:
  the interface claim (`sign-intent` is real, `sign-digest` is not in
  `KNOWN_COMMANDS`) was re-checked against the script at triage, so the defect
  does not rest on the pasted transcript alone.
- **Assignment (if accepted):** Sprint Nightwing (unchanged) — the item is about
  what a human is handed and can act on, which is that window's scope.
- **Date:** 2026-08-28
