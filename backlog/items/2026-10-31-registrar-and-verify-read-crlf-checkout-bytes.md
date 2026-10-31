---
schema: pipeline.backlog-item.v1
id: pipeline.registrar-and-verify-read-crlf-checkout-bytes
type: defect
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-10-31
sprint: alfred
source: "Toolbox finding N39 and its 2026-10-31 follow-up (Windows consumer, git core.autocrlf=true): verify-evidence-producer --commit fails with VEP-ADAPTER-CONFLICT, and a checkout of another commit and back makes the registrar report FTP-ARTIFACT-44/45/46."
---

# Registrar and Verify compare working-tree bytes, so CRLF checkouts look like drift

## What happened

Two places hit the same cause on a Windows machine with `core.autocrlf=true`:

1. `verify-evidence-producer --commit <sha>` checks the candidate out into a `git worktree`. The adapter file `project/consumer-verify.mjs`
   is written there with CRLF line endings, and `assertConsumerVerifyAdapter` (`lib/consumer-verify.mjs`) compares it byte for byte with the
   expected LF text, so the producer refuses with VEP-ADAPTER-CONFLICT. The index and the main working tree are LF (`git ls-files --eol`
   says so): the difference is only the line endings of the file inside the producer's own worktree.
2. A `git checkout <other commit>` and back rewrites tracked evidence files as CRLF. The registrar reads working-tree bytes and reports
   FTP-ARTIFACT-44/45/46 "digest does not bind file bytes", because `lifecycle.json` binds the LF hashes.

## Cause (verified by the reporting session)

Byte-exact reads of working-tree files, where the bound digests are over the committed (LF) blob.

## Workaround that worked

Delete the affected files and rewrite them with `git -c core.autocrlf=false checkout HEAD -- <paths>`. A plain checkout without the deletion
is a no-op.

## Proposed direction

Read the committed blob (`git show <commit>:<path>`) for every digest comparison of tracked evidence and for the adapter check, or hash
CRLF-neutral. Measure first which readers compare bytes (registrar, Verify adapter check, any evidence validator) and cover each with a test
that runs under `core.autocrlf=true`; a native Windows run is the real check.
