# Draft: PO acceptance points hold only their dependent slices

## Status and date

Proposed, 2026-10-19. This draft records PO decision D33
(`specs/sprint-alfred-epic/plans/po-decisions-2026-10-18.md`). It paraphrases the
PO's chat decision. It is not a quoted transcript and not an approval receipt.
Numbering follows ADR-0069 at acceptance. It builds on ADR-0085 (one review, one
signature for the design approval), ADR-0076 (the chat-attributed, unattested
approval mode) and ADR-0077 (push approvals per destination).

## Context

In the 2026-10-18 Claude greenfield run (finding P0-5), the PO named a point at
which they wanted to look at the result before work went on. The session went past
it. The slice queue (`lib/slice-queue.mjs`) already validates a `hold-po` state
with a required hold reason, but nothing creates one. The approved delivery course
carries no typed acceptance point, and no command records the PO's release. So the
only protection was the Elephant's memory.

The PO set three constraints. First, the happy path keeps exactly two signatures:
the design approval and the push approval. Second, waiting for the PO on one point
must not stop unrelated work, because the Pipeline works on other things in
parallel while it waits for PO input. Third, an acceptance point exists only where
the PO asked for one.

## Decision proposed

1. **Declared in the plan.** A PO acceptance point is a typed entry in the
   approved plan: `id`, a short label, and the slice ids that depend on it. It is
   part of the content the design approval already signs, so declaring points
   adds no signature. A plan without such a request has no points.
2. **Seeded, not remembered.** When the governed item queue is prepared, every
   declared point becomes one `hold-po` slice whose hold reason names the point.
3. **Holds only its dependants.** Dispatch admission refuses a slice that depends
   on an unreleased point, with a typed code naming the point. Every other slice
   stays dispatchable, so parallel work continues while the PO is away.
4. **Released in chat.** When the work before a point is done, the Elephant
   shows the PO the result. The PO releases the point in chat. The Elephant
   records the release with one command: the record is bound to the current
   commit and labelled chat-attributed and unattested, as in ADR-0076. It is
   attribution, not proof.
5. **Covered by the push signature.** The push approval package lists every
   declared point and its release record. A release the PO did not give is
   therefore visible in the one package the PO signs. A point that is still
   unreleased blocks the push approval of the work that depends on it.

## Consequences

- The happy path is unchanged: no points means no extra step, and points cost
  the PO a chat answer each, not a signature.
- The release record is weaker than a signature on its own. Its integrity rests
  on the push signature, which covers it after the fact. A forged release can
  get dependent work dispatched early, but it cannot reach the remote branch
  without the PO signing a package that shows it.
- The release command writes project state, so it lands in the protected
  `scripts/pipeline-state.mjs` and needs a signed ceremony once.
- The seeding and the admission refusal live in unprotected modules
  (`lib/native-goldfish-host-state.mjs`, `lib/slice-queue.mjs`).

## Out of scope for 0.7.0

- A per-point signature. The PO declined it on 2026-10-19.
- Role binding of the release's actor label, tracked with the `--by` role
  binding item after 0.7.0 (D36).
