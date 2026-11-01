# Held patch notes — the consumer Verify adapter check accepts CRLF line endings (N39 part 1, candidate 15c)

Patch: `w30-consumer-verify-adapter-check-accepts-crlf-line-endings-n39.patch`. Two files (`lib/consumer-verify.mjs`, `scripts/verify-evidence-producer.test.mjs`), independent of the other 15c patches. First of the two causes in `pipeline.registrar-and-verify-read-crlf-checkout-bytes` (Toolbox N39, Windows consumer with `core.autocrlf=true`).

## What

`assertConsumerVerifyAdapter` compared the adapter file byte for byte with the expected LF text. In a `git worktree` of a candidate on a machine with `core.autocrlf=true` the committed LF file is written with CRLF, so `verify-evidence-producer --commit` refused with `VEP-ADAPTER-CONFLICT`. The comparison now folds `\r\n` to `\n` before comparing; every other byte must still match, so a user edit, a stray CR or a changed text remains a conflict, and `prepareConsumerVerify` stays idempotent for such a file.

## Evidence

- One new case (CRLF of the identical text is accepted by `prepareConsumerVerify` and `assertConsumerVerifyAdapter`; an extra line is a conflict; a stray `\r` is a conflict and the file is left untouched). Producer suite 52/52, with the case-completion suite 84/84.
- Mutation: removing the fold turns the new case red (`VEP-ADAPTER-CONFLICT`).

## Not covered

- Cause 2 of the item (the registrar reads working-tree bytes after a checkout on `core.autocrlf=true` and reports FTP-ARTIFACT-44/45/46) is not touched: it needs a measurement of every reader that compares tracked evidence bytes, and a native Windows run is the real check. The item stays open.
- No native Windows run here; the case simulates the CRLF file on any platform.
