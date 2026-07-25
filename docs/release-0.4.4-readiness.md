# Release 0.4.4

**Status:** local hotfix candidate — not committed as a release candidate,
tagged, pushed, published, or read back from either marketplace.

## Scope

This patch fixes first-use onboarding for Codex's supported managed workspace
layout: empty, non-writable `.git`/`.codex` control paths (and `.agents` when
present) in an otherwise writable fresh project root. The initializer leaves
those controls untouched and writes only portable project authority plus
`.claude/**`.

The managed-root E2E test invokes the shipped CLI entry functions in-process
because this Codex sandbox rejects a nested Node process with `EPERM`. It still
uses real disposable filesystem roots and validates the public CLI output.

## Candidate boundary

`0.4.4` has exactly one evidence-bearing candidate. Its commit SHA and tree SHA
are captured only after all content and integration decisions are final. The
full verify evidence is intentionally git-ignored; it is a readback for that
candidate, not a file to commit after the verification run.

The two concurrent feature branches may rebase while this hotfix is still
unsealed. Before sealing, their owners and the release owner must agree which
changes are included in the public `main` candidate. The hotfix must then be
rebased or fast-forwarded to that final integration base exactly once and
committed. No merge, rebase, amend, generated-file update, documentation edit,
or version change is permitted after the candidate is sealed.

Any such change creates a new commit or tree and therefore invalidates *all*
previous 0.4.4 verification and Critic evidence. The release returns to the
first step below; evidence is never patched forward by assertion.

## Release sequence

1. **Integrate before evidence.** Finish the other branches' rebases and any
   selected integration into `main`. Confirm a clean worktree and review the
   complete intended diff. Do not run release verification or a Critic yet.
2. **Seal one candidate.** Create the one candidate commit, then record both
   `git rev-parse HEAD` and `git rev-parse HEAD^{tree}`. Confirm `VERSION` and
   both plugin manifests equal `0.4.4`. Those two identifiers are the only
   candidate identity used below.
3. **Verify the sealed candidate.** Run `node harness/scripts/verify.mjs` from
   that clean commit. Read `evidence/verify-latest.json` and require exit code
   `0`, `candidate.start.status: clean`, `candidate.finish.status: clean`, and
   exact equality of its commit and tree with the recorded candidate identity.
   The ignored evidence file must remain uncommitted.
4. **Review the same candidate.** Run one independent, read-only Critic on the
   sealed SHA and the final diff. Immediately read `HEAD` and `HEAD^{tree}`
   again; both must still match the recorded identity. A Critic finding that
   requires a change returns the release to step 1.
5. **Authorize the immutable publication.** Obtain explicit authorization that
   names the recorded commit and tree. Immediately before tagging, re-check
   that public `main`, `HEAD`, and `HEAD^{tree}` resolve to that same identity.
6. **Publish once.** Create annotated `v0.4.4` at that commit and push only the
   approved `main` ref and `v0.4.4` tag. Do not move, delete, or retag it.
7. **Read back.** Fetch the published refs; prove that `v0.4.4` peels to the
   approved `main` commit, then confirm public `VERSION`, both public plugin
   manifests, and both marketplace resolutions report `0.4.4`.

## Failure and recovery

An unavailable, dirty, mismatched, or incomplete evidence record is a release
stop, not a waiver. Preserve the immutable last known-good tag. If a defect is
found after publication, prepare a new reviewed patch release; never rewrite
or reuse `v0.4.4`.
