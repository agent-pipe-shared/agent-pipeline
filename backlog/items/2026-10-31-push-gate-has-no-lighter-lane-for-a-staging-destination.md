---
schema: pipeline.backlog-item.v1
id: pipeline.push-gate-has-no-lighter-lane-for-a-staging-destination
type: workflow-improvement
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-10-31
sprint: alfred
source: "Consumer request (2026-10-31, PO decision relayed by the consumer session): a staging deployment branch needs a lighter push lane than main; today it costs a full release Verify and a Critic round before every push."
---

# A staging destination has no lighter push lane than main

## What happened

A consumer deploys from two branches only, `main` (production) and `staging`. In `gates.push_approval: signature` every push to `staging` is a
protected publication: push-init, the human signature, `approve-push`, plus a release-mode Verify bound to a Critic PASS packet and the
security scan. A pure dependency and CI fix (a transitive override after a red audit on staging) therefore needed a new Critic round and a new
release Verify before it could reach staging. The PO states that the signature is never the problem (every push may be signed); the cost is the
Critic round and the release Verify per staging push.

## Cause (read from the code)

`lib/push-destination-policy.mjs` knows exactly two lanes: the feature checkpoint and the protected publication. The checkpoint namespace is
validated by a regex fixed to `refs/heads/feat/`, and a manifest value such as `refs/heads/staging/` is rejected ("no permissive default" is
the design). There is no list of gated destinations in `pipeline.user.yaml` or the calibration. The checkpoint lane also drops the security
scan, which the consumer wants to keep for staging.

## Target picture (consumer)

- `main`: full publication as today (release Verify, Critic PASS, security scan, signature).
- `staging`: signature yes, security scan yes, no Critic round, no release Verify bound to a Critic packet (at most the normal push Verify).
- `feat/*` checkpoint unchanged.

## PO tile (decision pending)

- A (recommended): a per-destination policy in the manifest (`pipeline.push-destination-policy.v2`: a closed list of `{ ref, lane }` with lanes
  `publication`, `staging`, `checkpoint`; no default, `main` can never be a lighter lane by configuration). The `staging` lane requires the
  signature and the security scan and the normal push-mode Verify, and skips the Critic packet and the release-mode binding. Protected kernel files:
  `hooks/guard-push.mjs`, `lib/push-destination-policy.mjs`, `scripts/push-init.mjs`, `scripts/push-prepare.mjs`, the manifest schema.
- B: widen `checkpointNamespace` to a configurable namespace. Smaller change, but the checkpoint lane has no security scan, so the consumer's
  requirement is not met, and a deployment branch would be published through the lane defined as "not a publication".
- C: keep the status quo; the consumer stays on the full route.

## Interim route in 0.7.0

None found. The only lighter lane is the `feat/` checkpoint, which is a backup and not a publication; deploying from it would use that lane as a
publication and is a PO decision, not a configuration.
