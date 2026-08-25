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

**Correction, 2026-08-24 (same session, before implementation started):**
the Elephant's first pass at this design assumed the whole ceremony runs
over the chat channel (so the agent would see the PIN in plaintext once
typed) and told the PO so; the PO accepted that framing and asked to start
anyway and validate empirically. Before dispatching implementation, the
Elephant read `plugins/pipeline-core/scripts/po-human-approval.mjs`
directly rather than relying on that assumption — `requireExplicitConfirmation()`
/ `defaultReadConfirmation()` read the confirmation word (a static token,
`"approve"`) and, downstream, the PIN itself, via `readSync(0, ...)` against
file descriptor 0 of the PROCESS RUNNING THE SCRIPT — meaning this command
is designed to be run by the human directly in their own terminal (the
agent hands them a command to copy-paste, exactly the
`attended-host-terminal`/`human-copy-only` execution-boundary pattern
already used elsewhere in this repo, e.g. `guard-human-override.mjs`'s
signature ceremony), not invoked by the agent's own tool call. **The agent
therefore does NOT see the PIN or the confirmation word at all** under the
`signature`-mode ceremony — a materially stronger property than first
described. This repo's own `gates.push_approval` is currently `signature`
(not `chat`), so if the new kickoff-parameter gate kind reuses that same
per-project calibration (per ADR-0061 Decision 2's own invariance
principle), it inherits the full external-key strength, not the lighter
`chat`-mode attribution-only variant ADR-0056 also offers.

**Open design question this correction surfaces, not yet resolved:**
`signature` mode binds an approval to a `candidate: {commit, tree}` (see
`plugins/pipeline-core/lib/critical-action-approval-request.mjs`,
`CRITICAL_ACTION_KINDS = ["push", "deploy", "publication",
"release-preflight"]`) — but `kickoff plan`'s language/profile question
often happens on a BRAND-NEW project, potentially before any meaningful
commit/candidate exists yet. Whether the new gate kind should genuinely use
full `signature`-mode candidate binding, or deliberately opt into the
lighter `chat` mode for this specific gate kind (since the threat here is
an overeager/hallucinating agent, not a high-stakes external effect like a
push), is a real tradeoff the PO has not yet weighed in on with this
corrected understanding. **Left open, not implemented tonight** — the
Elephant judged forcing this specific architecture call without PO input
would repeat the exact self-disposition mistake this session already
flagged and avoided for findings F3/F4/F5 earlier. Ready for the PO's next
session with this full context; the mechanism survey above
(`critical-action-approval-request.mjs`, `po-human-approval.mjs`) is
already done and does not need repeating.

**Not yet designed/implemented:** the exact new gate-kind wiring inside
`po-human-approval.mjs`/`po-approval-gate.mjs`, how `kickoff plan` rejects
an unapproved value, and the live test run validating the shape actually
works end to end. Scope this as its own dispatch package (genuine design
latitude in the gate-kind wiring — `goldfish-deep` tier) once picked up;
not started this session.

## Mode decided, 2026-08-25 (PO decision)

**`chat` mode**, not `signature`. Rationale (PO-confirmed): the threat
model here is an overeager/hallucinating agent typing a value without
asking, not an external attacker — `chat` mode's attribution-only property
already covers that, and it needs no `candidate: {commit, tree}` binding,
which matters because this gate fires on a brand-new project that may not
have a meaningful commit yet (the exact tension the "Open design question"
section above flagged). Ready for implementation dispatch.
