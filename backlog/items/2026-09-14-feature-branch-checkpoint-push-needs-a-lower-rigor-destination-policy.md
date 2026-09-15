---
schema: pipeline.backlog-item.v1
id: pipeline.feature-branch-checkpoint-push-needs-a-lower-rigor-destination-policy
type: requirement
owner: pipeline
status: open
created: 2026-09-14
sprint: nova
source: "PO requirement, 2026-09-14, after an Alfred-sprint feature-branch checkpoint push was blocked by release-grade marketplace attestation and push-authority prerequisites while the active external marketplace could not safely be replaced."
done_when: manual
---

# A feature-branch checkpoint push needs a lower-rigor destination policy than a protected release push

## Description

An ordinary push of the active feature branch is needed as a recoverable
off-machine checkpoint during implementation. The current `guard-push.mjs`
path applies the same release-grade prerequisites to every destination,
including a feature branch: fresh full evidence, exact push authorization,
and, for this Pipeline-source checkout, a matching external marketplace copy.
That makes a harmless backup push unavailable when the external marketplace is
intentionally serving a different active checkout (for example Nova), even
though no merge, release, tag, destructive rewrite, or protected ref is being
requested.

The PO requires a materially simpler feature-branch checkpoint route. This is
not permission to create a raw-push bypass or to weaken the policy for `main`,
protected branches, release branches, tags, force pushes, deletions, or an
ambiguous destination.

## Triggering situation

During the Alfred sprint on 2026-09-14, the repository had a green
candidate-bound Verify result but could not make a feature-branch safety push:
the live `AGY-MKTATTEST-1` check correctly reported that the external local
marketplace did not match this checkout. Replacing it was not safe because the
Nova version had to remain active. The same interaction exposed the cost of
requiring a release-style approval and environment attestation merely to
preserve work on `feat/sprint-alfred`.

## Affected artifact

`plugins/pipeline-core/hooks/guard-push.mjs`; its shared push-authorization
and marketplace-attestation helpers in
`plugins/pipeline-core/lib/human-guard-override.mjs`; the push preparation and
approval commands; `docs/push-release-flow.md`; and the configured protected
branch/destination policy.

## Proposal

Introduce an explicit, centrally tested destination classification with two
non-interchangeable lanes:

- **Feature checkpoint lane:** an exact, non-force push to a configured,
  unprotected feature-ref namespace may use a deliberately reduced set of
  prerequisites suitable for a backup/checkpoint. It must still bind the
  candidate and explicit remote/destination, reject non-fast-forward and
  deletion forms, leave an auditable checkpoint record, and never silently
  treat an omitted or inferred destination as a feature ref. The design must
  state precisely which lightweight integrity check and which human intent
  signal remain required, if any.
- **Protected publication lane:** `main`, configured protected branches,
  release/stable branches, tags, force pushes, deletions, and unknown or
  unclassifiable destinations retain the existing release-grade gates. In
  particular, no feature-lane decision may disable marketplace attestation,
  candidate-bound authorization, or critical-proof requirements for these
  targets.

The classification must be configuration-driven and fail closed: a malformed,
missing, conflicting, or future-unrecognized destination policy selects the
protected lane rather than the checkpoint lane. The implementation must not
depend on mutating or synchronizing an external marketplace that another
active checkout owns.

## Acceptance

- A documented, reviewed policy defines the admissible feature checkpoint ref
  namespace and the protected/publication targets; it has no implicit default
  that broadens the feature lane.
- Tests prove that a configured non-force feature-branch checkpoint can be
  prepared and pushed without release-only external-marketplace synchronization
  or release-only ceremony, while retaining the documented checkpoint
  integrity/audit controls.
- Tests prove `main`, protected refs, releases/stable refs, tags, force
  pushes, deletions, malformed refspecs, and unknown destinations remain on
  the existing strict lane and cannot receive the feature-lane relaxation.
- The push-flow documentation gives a short, explicit command path for the
  feature checkpoint lane and separately identifies the stricter publication
  path.
- A Critic review covers the final destination classifier and negative-path
  tests before the policy is enabled by default.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** PO reassigned this cross-sprint push-policy improvement from
  Alfred to Nova on 2026-09-15. It remains open; this is a scope transfer, not
  a rejection or implementation claim.
- **Assignment (if accepted):** Nova
- **Date:** 2026-09-15
