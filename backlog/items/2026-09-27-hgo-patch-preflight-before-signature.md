---
schema: pipeline.backlog-item.v1
id: pipeline.hgo-patch-preflight-before-signature
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-27
sprint: alfred
done_when: manual
source: "Alfred 0.7 Reader terminal correction, 2026-09-27: two exact signed apply_patch actions failed on missing blank-line context before a third root-guide signature applied."
---

# Verify an exact HGO patch before requesting a human signature

The guard correctly bound each one-use PO signature to exact `apply_patch`
bytes. Two signed root-guide patches then failed normal patch verification
because a blank line was missing from a hunk's old context. Neither failure
changed the protected files, but each correction required a new guard plan and
another human signature. A routine patch-context error caused avoidable toil.

## Required behavior

- Offer a read-only patch applicability check against the exact frozen
  worktree/HEAD before emitting the signature intent. Show the file and hunk
  failure without arming or consuming a capability.
- Bind the signed intent to the same patch and preimage that passed the check;
  recheck at redemption and fail closed on drift. Do not broaden a signature
  to other paths or revised bytes.
- Keep a contained `scratch/` preparation path available while the guard is
  refusing protected writes; do not treat opaque read-only validation as a
  protected implementation write.

## Acceptance

A malformed hunk is rejected before human signing. A corrected patch signs
once and applies against the same frozen preimage. A changed preimage still
requires a fresh review and signature. The failed attempt does not claim an
edit or success.

## Triage

- **Decision:** pending
- **Assignment:** Alfred release preparation
- **Date:** 2026-09-27
