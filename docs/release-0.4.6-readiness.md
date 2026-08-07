# Release 0.4.6

> **Historical preparation record (superseded).** `v0.4.6` is delivered and
> closed; the sequence below is retained as provenance only, not current work
> or authority. Its old local-tag and candidate language is historical, not a
> current action.

**Historical status:** this was local-only patch candidate preparation. The existing local
`v0.4.6` tag points to the old commit
`3c96cb083bbdfcf68ce583513070ad2c67f4a5cf`; no corresponding remote tag or
release is claimed. This document authorizes neither moving nor deleting that
local tag.

## Scope and authority

This candidate contains the cleanup-recovery and sanitized owner-readback
corrections. The PO explicitly authorizes preparation of this `0.4.6` patch
release. `0.4.6` remains the chosen `0.4.x` patch/hotfix line; `0.5.0` is
reserved for a future sprint and is not authorized for this repair. That
authorization is preparation-only: every actual push, tag, or release approval
must be obtained later and must name the final candidate commit and tree.

## Required version equality

| Surface | Required release resolution |
| --- | --- |
| `VERSION` | `0.4.6` |
| Codex plugin manifest | resolves to `0.4.6` (an allowed Codex cachebuster may follow `+`) |
| Claude plugin manifest | `0.4.6` |
| Codex marketplace readback | `0.4.6` after publication |
| Claude marketplace readback | `0.4.6` after publication |

## Candidate boundary and release sequence

1. Finalize all intended source, documentation, version, and integration
   changes, then create one final candidate commit. Record its exact `HEAD`
   and `HEAD^{tree}`; these are the only release identity.
2. From that exact clean candidate, run the full configured Verify gate and
   Security gate. Read back their exact evidence and require successful,
   candidate-bound commit/tree identity and no unapproved Security finding.
3. Obtain one independent Critic review of that same final candidate, then
   re-read the candidate commit, tree, worktree, both version manifests,
   `VERSION`, Verify evidence, Security evidence, and Critic result.
4. Obtain explicit final approvals for the push, tag, and release. Each
   approval must name that exact final commit and tree; no earlier PO approval,
   local tag, historic evidence, or preparation authority substitutes for it.
5. Only after the final push/tag approval, push the approved branch/ref and
   the approved immutable `v0.4.6` tag. Read back the remote branch/ref and
   require the tag to peel to the approved candidate identity.
6. Read back both marketplace resolutions as `0.4.6`, together with the
   remote ref and tag. Do not publish the GitHub Release or make a marketplace
   publication claim until those readbacks are complete.

## Invalidation and recovery

A Critic-required code change creates a new candidate and invalidates all
prior candidate evidence. Return to step 1 and rerun the full cycle; evidence
is never carried forward by assertion. The release version remains `0.4.6`
through that cycle unless the PO expressly retires it in favor of `0.4.7`.

If a defect is found after publication, prepare a new reviewed patch release;
do not rewrite the published tag.
