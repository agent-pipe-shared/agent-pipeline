# Session capability probe concurrency evidence

`NVA-B-CAPABILITY-CONCURRENCY-2` closes the remaining cleanup interleaving in
the disposable session capability probe. When a creator receives `ENOTEMPTY`,
a concurrent peer can retire its valid descriptor while keeping the now-empty
directory because it observed that directory as preexisting. The creator now
performs a bounded retry of only that directory removal. A live valid
descriptor remains concurrent ownership; invalid, symlinked, permission, and
other nonempty state remains fail-closed.

Controlled RED: `scratch/NVA-B-CAPABILITY-CONCURRENCY-2/controlled-red.txt`
records the creator as `unavailable` at `directory-rollback` after the peer
retires. Controlled GREEN: `scratch/NVA-B-CAPABILITY-CONCURRENCY-2/controlled-green.txt`
records the same ordered interleaving as ready with no leftover directories.

Final verification: `scratch/NVA-B-CAPABILITY-CONCURRENCY-2/full-suite.txt`
captures `node --test plugins/pipeline-core/lib/codex-onboarding-capabilities.test.mjs plugins/pipeline-core/hooks/guard-apply-patch.test.mjs` (exit 0; 31 tests);
`scratch/NVA-B-CAPABILITY-CONCURRENCY-2/consumer-safe-paths.txt` captures the
consumer-path suite (exit 0; 9 tests); and
`scratch/NVA-B-CAPABILITY-CONCURRENCY-2/repeat-driver.txt` captures all ten
successful iterations of the parent repeat driver.

The generated bootstrap-checkpoint guard integration remains a separately
owned follow-up package and is not represented as covered by this evidence.
