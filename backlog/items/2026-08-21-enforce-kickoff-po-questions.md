---
schema: pipeline.backlog-item.v1
id: pipeline.enforce-kickoff-po-questions
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-21
source: Manual observation during sprint_agy kickoff testing (Rune_Test1_Agy_060_59)
---

# Move kickoff PO questions (language, profile) to technical enforcement

## Description

The `pipeline-start` skill currently relies on the instruction layer to ensure the agent stops and asks the Product Owner (PO) for the project's language and profile (`Ask the PO once now for both... Never default or invent a value.`). While GPT-4o and Claude 3.5 usually obey this, less strictly aligned models (e.g., Gemini running in Antigravity) may hallucinate these values (e.g., `--language de`, `--profile feature`) and pass them directly into `kickoff plan` without asking the human. 

## Triggering situation

During the `sprint_agy` integration testing, the Antigravity agent invoked `kickoff plan` with hallucinated `language` and `profile` arguments. The technical enforcement layer (`guard-lifecycle-ready.mjs`) validated that the `--language` flag was present, but did not (and currently cannot) validate whether the agent actually obtained this value interactively from the user.

## Affected artifact

`plugins/pipeline-core/skills/pipeline-start/SKILL.md`, `plugins/pipeline-core/scripts/project-onboarding-v3.mjs`, and potentially `guard-lifecycle-ready.mjs`

## Proposal

Move the collection of these critical PO parameters from the prompt layer to the technical enforcement layer. Instead of allowing the agent to provide `--language` and `--profile` as CLI arguments, the `kickoff plan` script could halt and interactively prompt the user on the console, or `guard-lifecycle-ready.mjs` could require the agent to run a specific typed interaction tool (`ask_po_input`) before allowing the execution of `kickoff plan`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** The proposal is a new technical-enforcement primitive (an
  `ask_po_input`-style interaction gate, or a script-level interactive halt)
  distinguishing "the agent asked the human" from "the agent typed a value"
  — genuine guardrail/architecture impact and design latitude, not a small
  fix. Per `docs/operating-model.md` §7 triage rule 4, scope like this is a
  PO decision, not the Elephant's alone. No PO input on this specific item
  has been given yet.
- **Assignment (if accepted):** pending PO scoping decision on the
  enforcement mechanism shape before any implementation is planned.
- **Date:** 2026-08-24

## Design direction decided, 2026-08-24 (PO scoping conversation)

The PO scoped this directly (chat, 2026-08-24), rejecting a bespoke new
`ask_po_input` primitive in favor of reusing the pipeline's existing
uniform human-approval ceremony: **[ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md)**
("every human gate is the same ceremony — one command, one word, one PIN"),
which is explicitly designed to be invariant across gate kinds (ADR-0061
Decision 2: "A new gate that introduces its own ritual is, by this decision,
incorrectly designed").

**Direction:** `kickoff plan`'s `--language`/`--profile` values become a new
gate kind under the SAME ceremony (`po-human-approval.mjs` /
`po-approval-gate.mjs` family) instead of freely-typable CLI flags — the
agent proposes a value, the PO reviews and clears it through the standard
one-command/approval-word/PIN flow, and `kickoff plan` only accepts a value
carrying a valid, digest-bound approval for it.

**Known, explicitly accepted limitation:** the entire ceremony happens over
the same chat channel as everything else, so the dispatching agent DOES see
the PIN/passphrase in plaintext once the PO types it — there is no
out-of-band channel here. This does not defeat the mechanism's actual
threat model (ADR-0061 Decision 0: "the adversary is the agent, not the
human" — the gate exists to stop an agent from auto-approving on the
human's behalf, not to keep a secret from a fully-trusted assistant): the
agent cannot fabricate a valid PIN in advance to skip the step, since the
check runs in a script against a stored value, not against the agent's own
self-report, and the agent only sees the PIN after the PO has already
typed it — too late to have forged the approval. PO's own framing: start
with this shape and validate empirically in a real test run rather than
resolving the concern analytically first.

**Not yet designed/implemented:** the exact new gate-kind wiring inside
`po-human-approval.mjs`/`po-approval-gate.mjs`, how `kickoff plan` rejects
an unapproved value, and the live test run validating the shape actually
works end to end. Scope this as its own dispatch package (genuine design
latitude in the gate-kind wiring — `goldfish-deep` tier) once picked up;
not started this session.
