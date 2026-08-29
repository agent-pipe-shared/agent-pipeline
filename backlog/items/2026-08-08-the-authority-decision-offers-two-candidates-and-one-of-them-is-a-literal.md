---
schema: pipeline.backlog-item.v1
id: pipeline.authority-decision-candidate-is-a-literal
type: defect
owner: pipeline
status: open
created: 2026-08-08
sprint: nightwing
due: 2026-08-22
source: "Reported by the Phoenix session of 2026-08-08 after a PO authority decision it had to resolve; verified against the source in this repository before filing."
done_when: manual
---

# The authority decision presents two candidates, and one of them is a literal

## What the diagnosis asks of the human, and what it actually offers

`po-authority-decision-plan` returns two selection actions. The human is asked to
decide between them. Only one of them can be chosen:

`plugins/pipeline-core/scripts/pipeline-state.mjs:4326`

```js
selectionActions: [
  { selectedCandidate: "prd", status: "unavailable",
    code: "PO-DECISION-REFERENCED-SPEC-BYTES-UNAVAILABLE", mutation: false },
  { selectedCandidate: "spec", status: "available",
    executable: process.execPath, argv: [ … ] },
]
```

`status: "unavailable"` is written as an object literal. No repository state is
consulted at that point and no branch can produce a different value. The same
literal appears a second time in the candidate description at `:4052`.

## Why this is worse than an obvious placeholder

The `prd` candidate is not a stub. At `:4044` it is built from genuinely observed
data — `path`, `sha256`, `identity`, the technical-Spec marker digest, and a
`referencedBinding` carrying the prior plan-approval and continuity digests — with
`provenance: "current-physical-worktree"`. Everything about it is measured except
the one field that decides whether it can be chosen.

That combination is what makes it misleading. A human reading a candidate this
thoroughly described has no reason to suspect that its availability is the single
unmeasured value in the object, so the decision reads as a real decision that
happens to have one blocked option, rather than as a single option with
decoration.

## The two possible readings, and how to tell them apart

The code name argues for the first: `PO-DECISION-REFERENCED-SPEC-BYTES-UNAVAILABLE`
says the *spec bytes the PRD references* are unavailable. Selecting the PRD
candidate would then require a historical Spec version that the current worktree
does not contain — a genuinely structural unavailability, in which case the literal
is a correct answer arrived at by the wrong route.

The second reading is that it is an unfinished branch: the `spec` path was
implemented, the `prd` path was stubbed to keep the shape symmetrical, and nothing
came back to it.

The discriminator is whether any repository state exists in which the referenced
Spec bytes *are* recoverable. If yes, the literal is wrong. If no, the literal is
right and the diagnosis is wrong to present a decision at all.

## Direction, not a design

1. **Answer the discriminator first.** It decides whether this is a missing
   implementation or a missing explanation, and the two have nothing in common.
2. **If the unavailability is structural**, derive it and say why in the emitted
   reason, rather than asserting it — and stop calling the output a decision when
   exactly one action is executable.
3. **If it is a stub**, either implement the PRD selection path or remove the
   candidate. A permanently unselectable option in a human decision surface is
   worse than an absent one.
4. **Pin whichever holds.** Two tests currently assert the literal verbatim
   (`lib/project-onboarding-v3.test.mjs:1124` and `:1366`), so today the stub is
   protected by its own regression pins — they must move with the resolution, not
   block it.

## Triggering situation

A PO authority decision raised because the recorded approval bound a profile digest
that no longer exists. Reproducible wherever `po-authority-decision-plan` runs.

## Related

- `2026-08-08-the-authority-gate-reads-the-worktree-so-its-verdict-need-not-survive-a-checkout.md`
  — found in the same session, same authority surface.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by Sprint Alfred. Re-verified 2026-08-17:
  both cited literals (`plugins/pipeline-core/scripts/pipeline-state.mjs:4203`,
  `:4481` — line numbers shifted from the original `:4326`/`:4052` but the
  same unconditional `status: "unavailable"` object literal is still there,
  unchanged in substance) are still unresolved.
- **Rationale:** an authority-decision surface presenting a fake choice is
  exactly Sprint Alfred's confirmed scope — "control integrity" —
  (`docs/adr/0043-post-go-live-sprint-model.md`'s 2026-08-17 amendment).
  Answering the item's own discriminator question first (is the
  unavailability structural or an unfinished stub) is real investigation
  work, not urgent for Nova A or Phoenix.
- **Assignment (if accepted):** next available Alfred slot; answer the
  discriminator (Direction step 1) before choosing between steps 2 and 3.
- **Date:** 2026-08-17
