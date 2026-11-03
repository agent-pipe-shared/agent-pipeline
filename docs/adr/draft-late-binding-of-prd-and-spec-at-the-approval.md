# ADR: Bind the PRD and the Spec at the approval, not at the end of onboarding

Status: Proposed (draft for an independent review and the PO's decision; nothing here is built)

Date: 2026-11-03

## Context

At the end of onboarding (`bootstrap-bind-apply`, `kickoff promote apply`) the promoted PRD, Spec and `design-input.md` become the bound authority documents: their digests are written into `continuity.authority` and a promotion record, the guard refuses a direct edit (`GUARD-LIFECYCLE-AUTHORITY-BOUND`), and a change goes through `reopen-design`, edit, `submit-plan`, `approve-plan`. The approval (the PRD release, EL-19) comes later and its signature already covers the exact bytes it releases.

Three runners in the candidate 18 greenfield tests (PO report 2026-11-03) kept manoeuvring into locks between the bind and the approval and searched for commands; one read a digest drift as a block and wanted to stop (finding C19-G3, fixed by naming the cause and the exits). The core issue named by the PO is the early hard binding: the sequences exist because the documents are locked while they are still being worked on.

## Decision (proposed)

Two states of the design package.

1. **draft**: the package paths are registered in State; no authority digest is bound; ordinary edits to the PRD and the Spec are admitted by the guard. `design-input.md` stays refused for edits in the draft state as well: its digest is recorded at capture (provenance, in the promotion record, not as an authority digest), and the seal refuses when the bytes differ from that record, so a draft edit cannot launder the provenance. Readiness reviews, advisories and the Critic preflight bind the digest of the exact bytes they read and become stale when the document changes afterwards.
2. **sealed**: one agent-prepared, digest-bound plan binds the digests in the same transaction as the approval, so the PO signs one thing. From then on everything stays as today: the lock, `reopen-design`, rebind.

The seal replaces the current promotion bind as the point where `continuity.authority` receives digests. Until the seal, `continuity.authority` carries the paths and a `sealed: false` marker.

### The control that replaces the lock (refusal rules, not a label)

"Stale" is not a control by itself. The seal is specified by its refusals, each fail-closed:

- **Seal refuses on a stale review.** The prepared plan lists the digest of every PRD, Spec and design-input byte it seals and the digest each readiness review, advisory and Critic preflight bound. The seal refuses when any bound review digest differs from the bytes being sealed.
- **Apply refuses on drift since prepare.** The plan carries the digests it was prepared against and the signature covers the plan digest; the apply step re-reads the documents under the writer lock and refuses when any byte differs (the draft admits edits, so nothing else holds the bytes during the signing window).
- **Readers fail closed.** One shared reader returns `{sealed, digests}`; the readers that are authority-bearing gates after the approval (close, release preflight, push and publication subjects) refuse on `sealed: false`, with the typed exit "prepare the seal". The approval itself is the seal, so it refuses when no seal plan is prepared, not on `sealed: false`. The guard tripwire does not re-impose the lock in the draft state: before the seal it fires only for `design-input.md`, after the seal as today. Only the drift detectors treat a draft as not drifting, and the build plan lists them explicitly. No reader decides its own default for an unsealed package.
- **Seal trigger by scope.** The late bind applies to packages that need the PRD release (EL-19: rigor >= 1 or risk class high). A package outside that scope has no approval to seal at, so it keeps the bind at the end of onboarding exactly as today.

## Consequences

- No lock before the approval; one ceremony instead of two; the runner needs no knowledge of the rebind sequence for a draft edit.
- The bound digests are read in about 70 files (continuity observation, readiness review, design advisory, Critic preflight, close, the guard tripwire). They move behind the one shared reader above; the build plan counts and lists them (the figure is to be re-measured, not taken from this draft).
- Already bound projects: bound and approved projects are sealed (migration is the identity). Bound but not yet approved projects stay under the old rule, locked, until their approval, which then seals as usual; they are not labelled sealed without an approval.
- Trust model: between the bind and the seal the guard no longer protects the documents; the protection moves to the digests of the reviews and of the approval. An agent could change the documents between a review and the approval, but the approval signature covers the final bytes and a review of other bytes is stale.
- Test surface: the continuity, readiness, advisory, close and guard suites and the three-runner happy-path pins.

## Alternatives considered

- Keep the early bind and make every refusal carry its typed exit (done in part by C19-G3; it removes the dead ends but not the sequence).
- A single agent-executable `design-amend` that hides reopen, edit window and resubmit while no approval exists. Smaller, but it keeps two representations of the same state and needs a decision on the `--by` label for an unapproved draft.

## Open questions for the review

1. Is a `sealed: false` marker in `continuity.authority` acceptable to every reader, or does the seal need its own record?
2. Does the readiness review bind to the digest at request time, or must it be re-requested after any edit? (Proposed: bind at request time, stale on change.)
3. Should the seal and the approval be one command or two prepared steps? (Proposed: one prepared plan, one signature.)
4. Bound but not yet approved projects: stay locked under the old rule until their approval (proposed above), or offer a typed one-way move to the draft state?

## Review record

An independent Critic review (fresh context, review tier, one pass over the first version of this draft) returned five findings, all addressed in this revision: F1 (major) the replacement control was a label, now the refusal rules above; F2 the "already bound stay sealed" contradiction, now stated per bound/approved state; F3 no seal trigger outside EL-19 scope, now stated; F4 the design-input provenance had no mechanism, now the capture record and the seal refusal; F5 the authorship trailer of the first commit named the stage-0 fast path for three files, a form error of the commit (design-phase authoring uses the design trailer), not of the content. After the review the revision itself was corrected once more (the approval is the seal and cannot refuse on an unsealed package; the guard tripwire must not re-impose the lock in the draft state). The revision is not re-reviewed; a delta review against the first version is the next step if the PO wants the proposal built. Not verified by the Critic: the named commands and the `continuity.authority` shape.

## Not decided

This draft makes no change to State, the guard or any reader. It needs the PO's decision before any build (EL-04).
