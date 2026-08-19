# ADR-0066: publication's approval-time-only Ed25519 signature check is an accepted, bounded tradeoff — no execution-time re-verification

> Agent-Pipeline · Sprint Phoenix · as of 2026-08-19

**Status:** accepted (2026-08-19, PO instruction — direct choice of Direction 2 between the two directions
named in `backlog/items/2026-08-19-publication-authority-lacks-execution-time-criticalproof-reverification.md`).
**Contrasts with** [ADR-0056](0056-push-approval-mode.md) (push's signature mode) and the execution-time
re-verification `plugins/pipeline-core/lib/critical-action-authorization.mjs` implements for push/deploy —
publication deliberately does NOT adopt that shape; this ADR is the recorded reason why not.

**Governs:** `plugins/pipeline-core/lib/publication-authority.mjs`, `plugins/pipeline-core/scripts/publication-executor.mjs`,
`plugins/pipeline-core/hooks/guard-push.mjs` (`enforcePublicationAuthorization`, lines 936-980),
`plugins/pipeline-core/scripts/pipeline-state.mjs` (`publication-approve`, `state.publicationCriticalProofs`).

## Context

Push and deploy re-verify a human's detached Ed25519 signature at the exact moment the
externally-effective action is about to happen. `authorizeRecordedPush`/`authorizeRecordedDeploy`
(`critical-action-authorization.mjs`), called from `guard-push.mjs` immediately before the guard lets
the actual push/deploy-triggering command through, rebuild the exact subject
(`criticalActionSubjectSha256({kind, candidate: {commit, tree}, subject})`) from what the guard can
*observe about the action happening right now*, rebuild the signed intent around it
(`createPoApprovalIntent`), and verify the detached proof against the trust-anchor key set committed
in `project/critical-human-proof.json`. A tampered or replayed state record cannot pass this check
without a fresh signature under the operator's key, because the check is re-derived from the live
candidate, not read off the record (`critical-action-authorization.mjs`'s own header: *"this module
verifies rather than believes"*).

Publication does not have this. `publication-approve` (`pipeline-state.mjs:2694-2715`, when
`policy.requiredKinds.has("publication")`) performs the same class of genuine Ed25519 verification —
once, at approval time, over a subject built from `prior.candidateOid`/`prior.candidateTree` (the
commit/tree captured at `publication-prepare` time). The resulting `criticalProof` is stored, but not
inside the publication-authority CAS record that governs the push: it is written to a separate ledger,
`state.publicationCriticalProofs[transactionId]`. Every subsequent transition —
`approvePublicationAuthority`/`authorizePublicationAuthority` (and their V2 counterparts),
`beginPublicationExecutionAuthority`, and the actual push performed by `publication-executor.mjs` — is
gated purely by CAS chaining (`expectedRevision`/`expectedStateSha256`/`expectedRawSha256` matching the
durable, `writer.lock`-protected `state.json`) and phase-machine invariants
(`validatePublicationAuthority`). Confirmed by reading `publication-authority.mjs`,
`publication-executor.mjs`, and the publication branch of `guard-push.mjs`
(`enforcePublicationAuthorization`): none of the three imports `critical-action-authorization.mjs` or
reads `publicationCriticalProofs`. The stored `criticalProof` is write-only audit trail; nothing reads
it back.

This gap was surfaced by `backlog/items/2026-08-19-publication-authority-lacks-execution-time-criticalproof-reverification.md`,
which named two directions: (1) bind the stored proof into the publication-authority CAS record and
re-derive/re-verify it immediately before the push, the same shape `authorizeRecordedPush` uses; or (2)
document the asymmetry as an accepted, bounded tradeoff if the CAS/lock chain's own guarantees are
judged sufficient without a literal signature re-derivation. The PO chose Direction 2 (item's "PO
Decision — 2026-08-19" section).

## Decision

The asymmetry is accepted as a deliberate, bounded tradeoff for the publication path specifically. It
is not treated as equivalent to push/deploy's guarantee — it is a *different kind* of guarantee
(state-machine/concurrency integrity, not a human-signature check bound to the literal commit being
pushed right now), judged sufficient here for reasons specific to this path:

1. **What actually carries trust forward, precisely.** Between the one genuine signature check at
   `publication-approve` and the actual push, nothing re-derives a signature — but the following do
   hold, checked in code, not merely by convention:
   - **Single-writer lock.** `publication-authority.mjs`'s `withLock` creates the lock file with
     `O_EXCL` (`constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL`) — only one writer can hold
     it at a time, and it is released only by the process that created it (`readFileSync(paths.lock) === owner`).
   - **Strict CAS staleness checks at every transition.** `requireCurrent`/`transition`/`executionTransition`
     all compare the caller's `expectedRawSha256` against the freshly re-read record's actual digest and
     throw `"stale publication authority raw CAS"` on any mismatch — a stale or substituted record cannot
     be advanced.
   - **`validatePublicationAuthority`'s phase invariants.** The record's `status` (`active` /
     `executing` / `consumed` / `blocked`) constrains which fields may be non-null (e.g. `"active
     authority contamination"` if `execution`/`block` are populated while `status === "active"`), so a
     transition cannot skip or replay a phase.
   - **A temporal binding to the original approval window.** `beginPublicationExecutionAuthority` — the
     one-use external-effect boundary immediately before the executor may attempt any remote mutation —
     requires `startedAt >= publication.approval.approvedAt && startedAt <= publication.approval.expiresAt`,
     throwing `"publication execution approval expired"` otherwise. Execution cannot begin outside the
     window the human approved, even though it does not re-check the signature itself.
   - **The fixed executor's structural narrowness.** `publication-executor.mjs`'s own header: *"Fixed
     exact-candidate publication executor. The caller selects only an existing authority record.
     Repository identity, endpoint, candidate, destination and Git argv are all recovered from and
     checked against that record. No generic Git arguments or retry surface exist."* `guard-push.mjs`'s
     `enforcePublicationAuthorization` independently enforces exactly one matching typed authorization
     (`valid.length !== 1` blocks) and refuses any raw Bash/Git command from consuming publication
     authority at all (`"raw Bash/Git cannot consume publication authority... generic, standing, GG-03,
     and Human Guard Override authority remain closed"`).
   - **`main` is structurally the only destination for the v1 publication schema.** `publication-executor.mjs`
     line 215: `if (state.schema === PUBLICATION_SCHEMA && state.destinationRef !== MAIN_REF) fail("PX-DESTINATION",
     "fixed v1 publication destination must be refs/heads/main")`. `guard-push.mjs` separately defends
     `main` against any non-executor route: *"the executor keeps its exclusive claim on exact-candidate
     publication authority, and the anonymous-public delivery path refuses main independently a few
     hundred lines up... Only the plugin-owned fixed publication executor may consume exact-candidate
     main authority; GG-03 and Human Guard Override do not widen it."* (The v2 schema generalizes
     `destinationRef` to any `refs/heads/*` pattern — validated by `publication-bundle-v2.mjs`, not
     hardcoded to `main` — but the two channels the pipeline actually defines today, `private` and
     `neutral-public`, are release channels, not a general per-branch push surface a session reaches on
     its own.)

2. **Why this is judged sufficient for publication specifically, not generalized to push/deploy.**
   Push/deploy are the general-purpose surface every session, every branch, reaches — that breadth is
   exactly why they need the literal last-moment guarantee (`critical-action-authorization.mjs`'s own
   header states this design split explicitly: *"nothing here applies where the project has
   deliberately stood the proof down... Publication keeps its own external-verification route through
   the fixed executor and is untouched here"*). Publication is release-only, reaches exactly one
   destination class (`main`, structurally fixed for v1; a narrow, named-channel set for v2), and
   executes exclusively through one fixed, argument-closed executor script — never an arbitrary `git`
   invocation a session could construct. That is a materially narrower blast radius than the general
   push/deploy surface, and the CAS/lock chain enforcing it was independently found functionally
   complete against its own contract during `PHX-WP-PUBLICATION-UNIFICATION` (cited in the backlog
   item's `source` field). On that combination — narrow surface, fixed executor, already-audited state
   machine — the PO judged the CAS/lock discipline sufficient without adding a second signature
   re-derivation.

3. **Direction 1 is not closed off, only deferred.** Binding the stored `criticalProof` into the
   authority record and re-deriving it at `beginPublicationExecutionAuthority` (or a new pre-push
   checkpoint in `publication-executor.mjs`) remains the more literal fix and the template to reuse if
   the Follow-up conditions below are triggered.

## Consequences

**Positive.** No versioned publication-bundle schema migration, no change to `publication-executor.mjs`'s
trusted boundary, and no new code path for `guard-push.mjs`'s already Critic-scrutinized publication
branch to carry. The CAS/lock chain that now carries this trust forward was already built and already
independently verified functionally complete for its own contract before this decision, so the decision
adds no new surface to review.

**Negative.** Between `publication-approve` and the actual push, the "last check that ties the action to
a human's signature" is a single point-in-time event rather than one re-derived at the literal moment of
the external effect. A bug anywhere in the CAS/lock chain (a lock race, a stale-authority reuse edge
case, a future edit that loosens a CAS or phase check) would be caught by push/deploy's model, because
the signature re-derivation is the last word there; the same class of bug in the publication chain would
not be caught by anything resembling a signature check, because there is not one left to fail. This is
stated plainly as the accepted cost, not hidden behind the CAS/lock chain's genuine strength elsewhere.

**Risk.** The sufficiency argument in Decision §2 is destination- and executor-shape-specific. It does
not automatically survive a future change that widens what publication can target or how it executes —
tracked as explicit trigger conditions below rather than left to be silently assumed to still hold.

## Alternatives considered

- **Direction 1 — bind the proof into the CAS record and re-verify at push time, `authorizeRecordedPush`'s
  shape.** This gets publication to the same last-moment guarantee push/deploy have. Not chosen now:
  it requires a versioned `publication-bundle` schema migration (`validatePublicationAuthority`'s strict
  key-set checks) and touches `publication-executor.mjs`'s trusted boundary, for a path the PO judged
  already sufficiently narrow. Kept as the template for a future migration if the Follow-up conditions
  below are met.
- **Leaving the asymmetry undocumented.** Explicitly rejected by the backlog item itself: "leaving the
  asymmetry undocumented (its current state before this filing) is not an acceptable third option." An
  implicit gap in a critical-action authorization path is a defect regardless of which way the tradeoff
  is ultimately decided; this ADR is the record that closes that specific defect.

## Follow-up

- **Destination scope widens.** If publication's v2 schema is ever used to let `destinationRef` vary
  across a general set of branches reachable in ordinary session use — not a small, named, release-only
  channel set — the "narrower blast radius than push/deploy" half of Decision §2 no longer holds and
  Direction 1 should be revisited.
- **Executor boundary loosens.** If `publication-executor.mjs` ever gains a generic Git argument surface,
  a retry path, or any route that lets a caller influence the pushed command beyond selecting an existing
  authority record, the "fixed, argument-closed executor" half of Decision §2 no longer holds and
  Direction 1 should be revisited.
- **A concrete incident.** A CAS/lock bug, a lock race, or a stale-authority reuse edge case actually
  surfacing on the publication path is the precise class of failure push/deploy's model would catch and
  publication's would not (Consequences, Negative). Such an incident is the strongest possible trigger to
  migrate publication onto push/deploy's execution-time re-verification shape.
- Resolved the same way ADR-0058's kernel-membership follow-ups are tracked: a dated correction to this
  ADR either records that Direction 1 was implemented, or records that a trigger fired and was
  reassessed with the tradeoff still accepted. Owner `pipeline`, no date — trigger-based, not
  calendar-based.
