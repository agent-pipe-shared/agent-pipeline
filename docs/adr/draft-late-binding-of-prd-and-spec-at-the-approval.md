# ADR: Bind the PRD and the Spec at the approval, not at the end of onboarding

Status: Proposed (draft for an independent review and the PO's decision; nothing here is built)

Date: 2026-11-03

## Context

At the end of onboarding (`bootstrap-bind-apply`, `kickoff promote apply`) the promoted PRD, Spec and `design-input.md` become the bound authority documents: their digests are written into `continuity.authority` and a promotion record, the guard refuses a direct edit (`GUARD-LIFECYCLE-AUTHORITY-BOUND`), and a change goes through `reopen-design`, edit, `submit-plan`, `approve-plan`. The approval (the PRD release, EL-19) comes later and its signature already covers the exact bytes it releases.

Three runners in the candidate 18 greenfield tests (PO report 2026-11-03) kept manoeuvring into locks between the bind and the approval and searched for commands; one read a digest drift as a block and wanted to stop (finding C19-G3, fixed by naming the cause and the exits). The core issue named by the PO is the early hard binding: the sequences exist because the documents are locked while they are still being worked on.

## Decision (proposed)

Two states of the design package.

1. **draft**: the package paths are registered in State; no digest is bound; ordinary edits are admitted by the guard. `design-input.md` stays immutable once captured (provenance). Readiness reviews, advisories and the Critic preflight bind the digest of the exact bytes they read and become stale when the document changes afterwards (the invariant that holds today after the seal).
2. **sealed**: one agent-prepared, digest-bound step binds the digests in the same transaction as the approval, so the PO signs one thing. From then on everything stays as today: the lock, `reopen-design`, rebind.

The seal replaces the current promotion bind as the point where `continuity.authority` receives digests. Until the seal, `continuity.authority` carries the paths and a `sealed: false` marker.

## Consequences

- No lock before the approval; one ceremony instead of two; the runner needs no knowledge of the rebind sequence for a draft edit.
- The bound digests are read in about 70 files (continuity observation, readiness review, design advisory, Critic preflight, close, the guard tripwire). Each reader needs a defined behaviour for an unsealed package. The drift detectors must treat a draft as not drifting.
- Projects that are already bound stay sealed (migration is the identity).
- Trust model: between the bind and the seal the guard no longer protects the documents; the protection moves to the digests of the reviews and of the approval. An agent could change the documents between a review and the approval, but the approval signature covers the final bytes and a review of other bytes is stale.
- Test surface: the continuity, readiness, advisory, close and guard suites and the three-runner happy-path pins.

## Alternatives considered

- Keep the early bind and make every refusal carry its typed exit (done in part by C19-G3; it removes the dead ends but not the sequence).
- A single agent-executable `design-amend` that hides reopen, edit window and resubmit while no approval exists. Smaller, but it keeps two representations of the same state and needs a decision on the `--by` label for an unapproved draft.

## Open questions for the review

1. Is a `sealed: false` marker in `continuity.authority` acceptable to every reader, or does the seal need its own record?
2. Does the readiness review bind to the digest at request time, or must it be re-requested after any edit? (Proposed: bind at request time, stale on change.)
3. Should the seal and the approval be one command or two prepared steps? (Proposed: one prepared plan, one signature.)
4. Is the migration of in-flight draft projects (bound under the old rule, not yet approved) automatic?

## Not decided

This draft makes no change to State, the guard or any reader. It needs an independent review (fresh context, ADR-0014 contract) and the PO's decision before any build (EL-04).
