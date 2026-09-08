# File-boundary containment evidence

## Contract recorded by this increment

`isRealpathedWithinBoundary(resolved, boundary)` retains its deliberate early
literal `resolved === boundary` classifier result. For every non-identity
candidate, it realpaths and inspects the boundary; only a real directory may
contain a descendant. A regular file, including a symlinked file boundary after
realpath, therefore refuses `<file>/<nonexistent-child>`. A missing descendant
of a real directory retains the ancestor-walk admission. Boundary realpath or
inspection errors fail closed.

The primitive still preserves the existing raw candidate, symlink, and `..`
filesystem semantics. It does not lexically re-resolve candidates and does not
change the write lane.

## Current caller limits retained

The existing exact-file check in `isApprovedSingleCommandReadArg()` remains in
place. `isReadOnlyDiagnosticCommand()` adds per-invocation roots only to the
single-command, git-pipeline, `&&`, and trailing-stderr-redirect families; the
rg bounded-pipeline and cat-pipeline families remain outside that extra-root
widening. This primitive repair makes a future direct FILE-boundary caller
safe; it does not claim that every read or write containment lane is resolved.

## Machine evidence

| Result | Command | Exit | Artifact |
| --- | --- | ---: | --- |
| Red, pre-fix direct real-filesystem regression | `node --test --test-name-pattern NVA-B-FILE-BOUNDARY-PRIMITIVE-1 plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` | 1 | `scratch/NVA-B-FILE-BOUNDARY-PRIMITIVE-1/red-guard-lifecycle-ready.txt` |
| Green, full lifecycle suite | `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` | 0 | `scratch/NVA-B-FILE-BOUNDARY-PRIMITIVE-1/green-guard-lifecycle-ready.txt` |
| Green, consumer path suite | `node --test harness/scripts/check-consumer-safe-paths.test.mjs` | 0 | `scratch/NVA-B-FILE-BOUNDARY-PRIMITIVE-1/green-consumer-safe-paths.txt` |
