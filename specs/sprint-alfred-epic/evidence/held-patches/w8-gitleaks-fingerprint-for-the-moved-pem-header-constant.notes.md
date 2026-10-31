# w8-gitleaks-fingerprint-for-the-moved-pem-header-constant (held patch, not applied)

Follow-up to `w8-gitleaks-fingerprints-for-117-reviewed-false-positives`. The D216-A read/write split edits `plugins/pipeline-core/scripts/po-human-approval.mjs`, which moves the string constant that detects an
unencrypted key file (a PEM header literal in a detection check, not a key) to another line. The fingerprint is line-bound, so its entry went stale and the applied tree showed 1 unresolved tracked finding
(measured on a rehearsal of the whole apply script: tracked covered 151, unresolved 1).

Change: one comment block and one `content-v1` line appended to `.gitleaksignore`, generated with the adapter's own `gitleaksContentAuthorityLine()` from the normalized real finding of the applied tree.
The earlier line-bound entry stays as a harmless record. Nothing is widened.

Must be applied after `w8-d216a-preflight-read-only-admission-closure` and before the final rebaseline; the apply script does so. Evidence: unresolved-findings measurement on the applied rehearsal tree after this patch (see the next run).
