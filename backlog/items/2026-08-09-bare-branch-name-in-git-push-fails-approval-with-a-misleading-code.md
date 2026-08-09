---
schema: pipeline.backlog-item.v1
id: pipeline.bare-branch-name-in-git-push-fails-approval-with-a-misleading-code
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "First end-to-end signed push of this repository (8dcb1cc..3387065, sprint_phoenix), confirmed at source in plugins/pipeline-core/lib/critical-action-authorization.mjs and plugins/pipeline-core/hooks/guard-push.mjs under dispatch PHX-BL4 (2026-08-09)."
due: 2026-09-08
---

# A bare branch name in `git push` fails the approval check with a misleading code

## Description

`approve-push` records `--destination refs/heads/sprint_phoenix`. `git push
origin sprint_phoenix` (a bare branch name, no explicit destination) was
refused with `PUSH-PROOF-INPUT-INVALID`; the identical push written as
`git push origin sprint_phoenix:refs/heads/sprint_phoenix` succeeded
immediately, same commit, same remote, same recorded approval. This cost a
failed attempt under time pressure during today's push.

Root cause: `guard-push.mjs`'s own push-command parser only populates a
`destination` when the refspec is explicitly `source:dest` — a bare branch
name leaves `destination` as `null`. `authorizeRecordedPush` then hits its
own input-validation guard for an absent destination and returns
`PUSH-PROOF-INPUT-INVALID` — which is the code the function's contract
actually specifies for a missing destination, so the code itself is
technically correct given what reaches it. What is misleading is that the
message reads as "your recorded approval input was malformed," when the
actual condition is "the push command left its destination implicit, and
this guard requires it spelled out to compare against the recorded one." A
reader chasing "invalid input" looks at the approval record; the real fix is
in the push command's own refspec.

## Triggering situation

Verified at source, quoted directly.

`authorizeRecordedPush`'s own input contract
(`plugins/pipeline-core/lib/critical-action-authorization.mjs:224-230`):

```
export function authorizeRecordedPush({ projectDir, anchorDir = projectDir, state, candidate, remote, destination, now } = {}) {
  const prefix = "PUSH-PROOF";
  if (typeof projectDir !== "string" || typeof anchorDir !== "string" || !object(state) || !validCandidate(candidate)
    || typeof remote !== "string" || remote === ""
    || typeof destination !== "string" || destination === "" || !validNow(now)) {
    return { authorized: false, code: `${prefix}-INPUT-INVALID` };
  }
```

versus the binding-agreement check reached only once `destination` is a
non-empty string (`critical-action-authorization.mjs:248-251`):

```
if (approval.forCommit !== candidate.commit) return { authorized: false, code: `${prefix}-COMMIT-MISMATCH` };
if (approval.remote !== remote || approval.destination !== destination) {
  return { authorized: false, code: `${prefix}-BINDING-MISMATCH` };
}
```

`guard-push.mjs`'s own refspec parser produces the `null` destination in the
first place — a bare (colon-less) refspec is accepted as valid input, with
`destination` left `null` (`plugins/pipeline-core/hooks/guard-push.mjs:355-357`):

```
const colon = refspec.indexOf(":");
const source = colon === -1 ? refspec : refspec.slice(0, colon);
const destination = colon === -1 ? null : refspec.slice(colon + 1);
```

and that `null` is passed straight into `authorizeRecordedPush` at the call
site (`guard-push.mjs:1663-1671`):

```
authorizeRecordedPush({
  projectDir,
  anchorDir: fallbackProjectDir(),
  state,
  candidate: { commit: sourceCommit, tree: sourceTree },
  remote: pushBinding.remote,
  destination: pushBinding.destination,
  now: new Date().toISOString(),
});
```

Given `destination === null`, `authorizeRecordedPush`'s contract correctly
produces `PUSH-PROOF-INPUT-INVALID` — this case genuinely never reaches the
`BINDING-MISMATCH` branch, because the type/emptiness guard fires first.
`PUSH-PROOF-INPUT-INVALID` is therefore the code this case SHOULD produce
under the function's own contract as written; the defect is that
`guard-push.mjs` never expands a bare branch name to its full
`refs/heads/<branch>` destination before calling it, so an ordinary,
unambiguous push (remote's configured refspec resolves `sprint_phoenix` to
exactly `refs/heads/sprint_phoenix`, matching the recorded approval) is
treated identically to a genuinely malformed one.

`docs/push-release-flow.md` Layer 5 ("execute the push") does not mention
that the full refspec (`source:refs/heads/<branch>`) is required — it only
documents `--destination refs/heads/<branch>` for `approve-push` (Layer 4),
leaving the push-command form undocumented.

## Affected artifact

`plugins/pipeline-core/hooks/guard-push.mjs` — `parsePushBinding` (leaves
`destination` `null` for a bare refspec); `docs/push-release-flow.md` Layer
5 (silent on the requirement).

## Proposal

Two separable proposals, deliberately not one fix:

1. **Narrower — document it.** State explicitly in `docs/push-release-flow.md`
   Layer 5 that the push command's refspec must be the full
   `<source>:refs/heads/<branch>` form, matching what `approve-push` already
   requires for `--destination`.
2. **Wider — expand it.** Have `guard-push.mjs` resolve a bare branch name's
   implicit destination (via the remote's configured push refspec, the same
   information `git push` itself would use) before calling
   `authorizeRecordedPush`, so an unambiguous bare-branch push is treated
   the same as its fully-qualified form.

This item does not choose between them — (1) costs nothing and closes the
immediate confusion; (2) removes the friction but requires the guard to
reproduce git's own refspec-resolution semantics, which is exactly the kind
of implicit behavior this guard family has elsewhere refused to guess at.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
