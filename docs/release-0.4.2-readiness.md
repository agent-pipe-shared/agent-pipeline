# Release 0.4.2

**Status:** candidate — not yet published.

This record is the release decision for the reviewed release candidate carrying
the V3 consumer-bootstrap correction and fresh-project onboarding. It supersedes neither the
historical `0.4.0` record nor the immutable `v0.4.1` tag.

## Publication decision

The approved public release is `0.4.2`. Before publication, the candidate must
pass the configured full verify with exact commit/tree binding and an
independent Critic review. Publication consists of exactly these irreversible
steps, in order:

1. fast-forward public `main` to the reviewed candidate;
2. create the immutable annotated tag `v0.4.2` at that exact public commit;
3. push only `main` and `v0.4.2`; then fetch/read back both refs and confirm
   the tag peels to the published `main` commit;
4. confirm the public `VERSION` and both plugin manifests resolve to `0.4.2`.

No cache projection, consumer file, private overlay lock, V2 configuration, or
hand-written consumer entrypoint is part of this release.

## Version surfaces

| Surface | Required value |
| --- | --- |
| `VERSION` | `0.4.2` |
| Codex plugin manifest | `0.4.2` |
| Claude plugin manifest | `0.4.2` |
| Codex marketplace resolution | the public Codex manifest above |
| Claude marketplace resolution | the public Claude manifest above |

The two marketplace rows are post-publication observations. They do not claim
that publishing source updates an already-installed cache.

## Rollback and recovery

Publication is intentionally immutable: `v0.4.2` must never be moved or
deleted. If a post-publication defect is found, the recovery is a new reviewed
patch release on `main` with a fresh immutable tag; consumers may remain pinned
to the prior known-good `v0.4.1` while that replacement is prepared. A source
revert on `main`, if needed, is likewise a new reviewed commit and never a tag
rewrite. The post-publication readback records the exact rollback baseline
(`v0.4.1`) and the newly published `v0.4.2` commit.

## Approval and scope

The product owner explicitly approved public publication of this release. The
release scope is limited to the V3 bootstrap and fresh-project onboarding
fixes; the concurrently developed Nova branch is excluded and must not be
pushed, merged, rebased, or otherwise modified by this release operation.
