# Feature-branch checkpoint push policy evidence

Status: implementation evidence for the opt-in checkpoint lane. This artifact
is bounded by the approved Sprint Nova specification and reviewed base commit
`6fafa91200e542ba874a7bbdaeeb9cb29539f3b1`. The reviewed implementation
input includes candidate commit `44e9a5f13a0f2e474a69ada56d238fbd9b887131`,
but this artifact does not predeclare the final delivery candidate: the exact
candidate and policy binding is produced by the detached protected-action
request after this artifact is committed. It is not a release approval,
signature, or authorization to publish.

## Decision and trust boundary

The feature-checkpoint lane is a lower-rigor, off-machine backup path for an
active feature branch. It is usable only when all of the following are true:

1. The loaded manifest is valid and contains exactly the opt-in policy
   `pipeline.push-destination-policy.v1` with a safe namespace ending in `/`.
2. The parsed source ref and destination are explicit branch refs, the remote
   is explicit, the destination starts with the configured namespace, and the
   source ref equals the destination exactly. The supported configuration is
   `checkpointNamespace: refs/heads/feat/`; it cannot designate `main`, a
   release/stable ref, a tag, or the whole `refs/heads/` namespace.
3. The candidate is clean and its `HEAD` has exactly one short printable
   `Checkpoint-Intent` trailer (3–280 printable ASCII characters).

The boundary is therefore the intersection of manifest validity, exact
source/destination binding, clean committed candidate, and intent evidence.
The `push-init` preflight emits only the matching same-ref push form; the push
guard independently reclassifies the command before any network action.

## Destinations deliberately retained as strict

Every destination outside the configured feature namespace remains on the
protected-publication lane. This includes `main`, configured protected refs,
release/stable refs, tags, unknown or malformed destinations, source/destination
mismatches, force or deletion forms, implicit destinations, and any policy that
is missing, malformed, unsupported, or future-versioned. The checkpoint lane
does not weaken Verify, security, Critic, marketplace, release, approval, or
publication requirements for those destinations.

Checkpoint eligibility is not a proof of review, release readiness, or human
authorization. In particular, it must never be described as a signature or
release authorization.

## Audit and evidence behavior

Immediately before the network action, the guard appends one record with schema
`pipeline.feature-checkpoint-audit.v1` to the Git common directory at
`.git/agent-pipeline/feature-checkpoint-audit.jsonl` (or the equivalent common
directory for a worktree). The record contains `kind: attempted`, timestamp,
full commit and tree IDs, remote, exact destination, and the committed intent.
The directory/file are created with owner-only permissions where supported.
Failure to resolve or persist the local audit record fails closed; the network
action is not attempted. This is an attempted-delivery audit, not proof that a
remote accepted the push.

## Disablement and rollback

To disable the lane, remove `pushDestinationPolicy` from the loaded manifest or
change it to a non-supported schema/namespace, then commit that configuration
change through the ordinary protected workflow. The classifier treats the
missing, malformed, or unsupported policy as `protected-publication`, so no
checkpoint push is admitted while disabled. To roll back the implementation,
revert the candidate commits that introduced the checkpoint classifier,
preflight, audit, and guard integration, then verify the resulting tree; do
not broaden the policy as a rollback substitute. Existing strict publication
destinations and their gates remain in force throughout.

## Residual risks and accountable expiry

The following are intentionally deferred and are not silently treated as
mitigations:

| Risk | Owner | Expiry / review deadline | Boundary statement |
| --- | --- | --- | --- |
| A remote may accept, reject, or later lose a checkpoint after the local attempted-delivery record is written; there is no remote acknowledgement receipt in this lane. | Agent-Pipeline maintainers | 2026-10-31 | The audit proves an attempted action only; operators must verify remote state separately before relying on a backup. |
| A user with credentials for the explicitly named remote can push a permitted feature ref outside this process, so local audit coverage is not a complete remote history. | Repository owner | 2026-10-31 | This policy constrains this guard path, not remote-side authorization or all credential use. |
| Checkpoint contents receive lower-rigor treatment and may not have fresh Verify/security/Critic evidence. | Sprint Nova PO / release owner | Before any checkpoint is used as a release or publication source, and no later than 2026-10-31 | The lane is backup-only; strict publication gates must be rerun for any promotion. |
| A same-name branch can be mistaken operationally for a protected branch when reviewing remote state. | Repository owner | 2026-10-31 | Exact `refs/heads/feat/` classification prevents admission to protected destinations, but human remote review still owns interpretation. |

No deferred risk above authorizes a scope expansion. At each deadline the owner
must either close the risk with evidence or renew it through the applicable PO
decision; absent that action, the checkpoint lane should be disabled.

## Authority references

- Approved contract: `specs/sprint-nova-epic/spec.md`.
- Manifest authority: `.claude/pipeline.yaml` and the loaded manifest schema.
- Classification: `plugins/pipeline-core/lib/push-destination-policy.mjs`.
- Preflight: `plugins/pipeline-core/scripts/push-init.mjs`.
- Enforcement and audit: `plugins/pipeline-core/hooks/guard-push.mjs` and
  `plugins/pipeline-core/lib/checkpoint-push-audit.mjs`.
- User-facing behavior: `docs/push-release-flow.md`.
- Threat model: `docs/guard-maintenance-window-threat-model.md`.
