# Release 0.4.3

**Status:** candidate — not published, tagged, pushed, or marketplace-read
back.

This patch candidate contains the issue #59 managed-onboarding repair. It is a
release surface update only; it does not itself create any irreversible release
state.

## Required version equality

| Surface | Required value |
| --- | --- |
| `VERSION` | `0.4.3` |
| Codex plugin manifest | `0.4.3` |
| Claude plugin manifest | `0.4.3` |
| Codex marketplace resolution | observe `0.4.3` after publication |
| Claude marketplace resolution | observe `0.4.3` after publication |

## Release gates

Before a release owner may publish this candidate, bind all evidence to the
exact reviewed commit and tree:

1. run the configured full verify gate, including the process-level temporary
   consumer-root test under an execution environment allowed to spawn Git;
2. record an independent Critic review of the candidate diff;
3. confirm both plugin manifests and `VERSION` equal `0.4.3`;
4. obtain the explicit release/push approval for the exact candidate; and
5. only then fast-forward the approved public branch, create immutable
   annotated tag `v0.4.3`, push the approved branch and tag, and read back the
   public refs plus both marketplace resolutions.

The current `release-version-plan.mjs` decision policy computes a next-minor
target and therefore is not evidence for this patch target. A release owner
must first use an approved patch-version decision path or update that policy
with its own reviewed change; this document does not bypass it.

## Recovery

Never move or delete `v0.4.3`. A discovered defect requires a new reviewed
patch candidate and immutable tag. Existing consumers may remain pinned to
their last known-good version while that work is prepared.
