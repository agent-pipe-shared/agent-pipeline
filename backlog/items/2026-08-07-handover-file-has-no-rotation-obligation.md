---
schema: pipeline.backlog-item.v1
id: pipeline.handover-file-has-no-rotation-obligation
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-07
source: "PO, 2026-08-07: 'state wird aber auch hoffentlich nicht unendlich lang sondern irgendwann wieder leer :) wenn etwas dauerhaft als regel geschrieben wird, dann muss es in adrs'."
due: 2026-09-06
---

# `docs/state.md` grows every session and is never rotated; the context-economy gate was placed on the file that grows slowly

## Description

[ADR-0012](../../docs/adr/0012-handover-canonicalization.md) made
`docs/state.md` the single canonical handover and established two deterministic
close gates: merge completion, and a **CLAUDE.md** length check for context
economy. No equivalent obligation exists for the handover file itself.

The result is a straightforward mismatch of gate to risk. `CLAUDE.md` is
deliberately short, changes rarely, and is length-gated. `docs/state.md` is
appended to by every session, is read first by every session under the bootstrap
mandate, and is gated by nothing. It currently stands at over 4,500 lines.

[ADR-0060](../../docs/adr/0060-handover-placement-and-rotation.md) makes this
sharper rather than better in the short term: it establishes that mid-task
findings belong in `docs/state.md` precisely *because* a fresh context is a
Goldfish and will not find anything else — which raises the growth rate — and
records a retention obligation (Decision 4) while explicitly leaving the
mechanism undecided (Decision 5). This item is that open decision.

There is a second, less obvious half. ADR-0060 Decision 3 says a durable rule
belongs in an ADR or a policy file, never in the handover. Today that is not
true of the existing file: rules, conventions and standing decisions are
embedded throughout it. Any rotation that simply deletes closed sections would
therefore destroy rules that exist nowhere else. Rotation cannot be designed as
a deletion step; it needs an extraction step first, and the extraction is a
one-time debt against the current 4,500 lines that is larger than the recurring
rotation work.

## Triggering situation

Raised by the PO on 2026-08-07 immediately after a session recorded held Critic
findings plus a standing rule into `docs/state.md`, correctly per the placement
rule but visibly adding to a file the PO expects to shrink again.

## Affected artifact

`docs/state.md`; [ADR-0012](../../docs/adr/0012-handover-canonicalization.md)
(close gates); [ADR-0060](../../docs/adr/0060-handover-placement-and-rotation.md)
Decisions 3–5; the `close-block` / `close-feature` ritual, which is where a
rotation step would most plausibly attach.

## Proposal

Not designed here — ADR-0060 Decision 5 states why: each candidate has a
different failure mode, and choosing among them is a PO decision about how much
history a fresh session genuinely needs *at bootstrap* versus on demand.
Candidates, explicitly not a commitment:

1. **A length gate in the close ritual**, mirroring what ADR-0012 already does
   for `CLAUDE.md`. Deterministic and consistent with existing precedent. Its
   failure mode is that a length trigger fires at an arbitrary moment that has
   nothing to do with whether a section's work is finished, which invites
   rotating live context to get under a number.
2. **Rotate at block/feature boundaries**, not by size: when a block closes, its
   handover sections are extracted and archived. Semantically correct — the
   lifetime of a section is the lifetime of its work — but it does nothing about
   a single long-running feature, which is exactly the present situation.
3. **Archive to a dated `docs/state-archive/`**, with the live file keeping
   pointer lines. Preserves history at the cost of reintroducing the Goldfish
   problem for archived material; acceptable only if the pointers are good
   enough that a fresh session knows when to follow one.
4. **Bound by session count rather than lines.** Closest to the real cost
   driver, but needs a session marker the file does not currently carry.
5. **Independent of the choice above:** a one-time extraction pass over the
   current file, lifting every embedded durable rule into an ADR, policy or
   guardrail file before any rotation runs. Without this, rotation is
   destructive. This is the larger piece of work and it does not depend on which
   of 1–4 wins, so it can start first.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
