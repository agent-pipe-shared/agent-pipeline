# A Critic packet claimed under an older plugin version cannot be finalized or released (Glossover PF-93, P0)

Relayed 2026-10-28 by the PO from the Glossover session (handover `docs/pipeline-handover-pf93.md` in that
repository, commit 938eefe; not readable from this repository, so the facts below are the relayed summary plus the
cause chain re-read in this repository's source).

## Observed

A Critic packet claimed (prelaunch admission) under plugin version A can be neither finalized nor released under
version B. It keeps the reservation for the old packet, which does not expire with its deadline, so a fresh course
cannot reserve. The independent verdict is lost. A delta round is impossible without the consumed parent packet.

## Cause chain (source of this repository)

1. `plugins/pipeline-core/scripts/critic-packet-preflight.mjs` `normalizeCoordinatorOnly` (about line 364) requires
   exactly the keys `schema, taskId, recordPath, recordSha256, sourceCandidateCommit, reviewCandidateCommit,
   assurance, snapshotId`, with `snapshotId` computed over an object that includes `assurance`. This is the D56
   binding assurance change (round-2 bundle v5 patch 2, installed 2026-10-28). A packet written before it has no
   `assurance` key and a `snapshotId` computed without it, so `validatePacketShape` fails with
   `CPP-COORDINATOR-BINDING`.
2. `plugins/pipeline-core/scripts/session-critic-finalizer.mjs` `finalizeSessionCriticReview` (about line 496-498)
   catches every error of `inspectClaimedSessionAdmission` and reports `SCF-PRELAUNCH-ADMISSION`, hiding the cause.

## Wanted

- A packet claimed before the assurance field is accepted in its old form as `assurance: null` (exact old key set
  and old digest only); any other drift stays refused.
- The hidden cause is passed through in the `SCF-PRELAUNCH-ADMISSION` output.
- A regression test over two version states.
- Not yet decided (PO): a release command for a claimed packet with an audit trail, because the reservation has no
  expiry and no release route today.

## Not verified

The cause of `CGB-PHYSICAL` at `admit` with the old packet, and the behaviour of a fresh course (derived from
source only). PF-91 stays open independently; the fallback OK of 2026-10-28 applies to it.
