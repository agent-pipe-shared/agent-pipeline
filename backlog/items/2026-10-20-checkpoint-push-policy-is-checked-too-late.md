---
schema: pipeline.backlog-item.v1
id: pipeline.checkpoint-push-policy-is-checked-too-late
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "PO report scratch/pipeline-feedback-03.md, findings PF-32 and PF-33; PO decision D56 (3)"
sprint: none
done_when: manual
---

# A checkpoint push policy is checked only after the signature

## Description

- **PF-32:** `push-prepare.mjs --checkpoint` reports `profile: feature-checkpoint`,
  `ready: true` and prints the signing command when the manifest has no
  `pushDestinationPolicy`. `guard-push` then classifies the destination as
  `protected-publication` and demands Verify and security evidence, so the PO's signature is
  spent on a push the guard does not admit. `docs/push-release-flow.md` does not mention the
  opt-in.
- **PF-33:** adding the policy to the manifest makes the plan approval stale
  (`CVCT-AUTHORITY-STALE`, the approval binds the manifest digest), and the named repair
  `node setup.mjs --publish-po-profile` does not exist in the shipped plugin.

## Acceptance (D56 (3))

- `push-prepare --checkpoint` and `push-init` refuse up front, before any signing command is
  printed, when the destination would not be classified as a checkpoint, and name the opt-in.
- The stale-approval refusal names a repair that exists: approving the plan again.
- `docs/push-release-flow.md` states the opt-in.
- The approval stays bound to the manifest.
