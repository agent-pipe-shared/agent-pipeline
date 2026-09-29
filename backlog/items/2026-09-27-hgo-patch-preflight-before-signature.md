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

## Native grammar observation during implementation

On 2026-09-29 the installed recovery guard refused a native Update patch's
canonical `*** End of File` marker as an unknown/ambiguous header at line 199.
The exact returned request is
`88898e74b1aaa65145897210ff72af05b4329e9e1a34ee7a5833cc7559abd6cd`.
No override was consumed. The correction attempt changed nothing; the earlier
delivery had placed two appended top-level blocks at repeated context instead
of their frozen positions. A later native exact-context correction restored
both positions. The frozen correction manifest is
`scratch/0.7-retirement-source-correction-and-protocol-20260929/manifest.json`
(`bcef71acb307a11c6f91c8501b14ccd83ef6eea1121d0d6114a9550f08a9eda5`).
The earlier drift and refusal remain recorded.

Source `guard-apply-patch.mjs` independently contains the same catch-all
unknown-header refusal after its file-operation headers. A bounded successor
must admit valid Update/rename EOF termination and continue refusing orphan,
duplicate, Add/Delete and nonterminal markers and unknown headers. Exact patch
preflight must account for the actual native grammar as well as applicability;
a signature should not be requested to repair a syntax-classifier mismatch.
The item stays open for integrated Source and installed-guard acceptance.

The same correction task's optional read-only whole-patch command,
`git apply --check --reverse`, was classified as mutating with unbound patch
targets. Exact request:
`69cf992e9c7e210884871fc9837285a3ce720dde11cc00ec8e4c9f978f6764c6`.
There was no retry or override after this refusal. Earlier per-target checks
and exact inverse evidence are retained separately. Applicability preflight
must recognize validation-only flags without admitting an actual mutation.

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
