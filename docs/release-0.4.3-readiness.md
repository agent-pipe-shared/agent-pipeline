# Release 0.4.3

**Status:** corrective candidate — a provisional public tag exists, but no
GitHub Release or marketplace readback has been published.

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
5. only then fast-forward the approved public branch and read back its ref. A
   provisional `v0.4.3` tag was created before the Critic finding; the PO has
   explicitly authorized deleting and recreating that tag on the corrected,
   re-verified commit. Read back the recreated public tag plus both marketplace
   resolutions before publishing the GitHub Release.

The current `release-version-plan.mjs` decision policy computes a next-minor
target and therefore is not evidence for this patch target. This release uses
the PO's explicit patch-release approval recorded in the release operation;
the release owner (`agent-pipe-shared`) must either add a reviewed patch-version
decision path or retire this exception by **2026-08-08**. Until then, no later
patch release may cite this exception implicitly.

## Recovery

After this one PO-authorized corrective replacement, `v0.4.3` is immutable.
A later defect requires a new reviewed patch candidate and immutable tag.
Existing consumers may remain pinned to their last known-good version while
that work is prepared.
