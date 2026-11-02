# w81 — a directory fsync that Windows refuses is a warning, not an abort (candidate 18, row C18-6)

Criterion binding: AC-127 is the closest existing accepted criterion; the PRD and Spec are unchanged.

## What it adds

- `plugins/pipeline-core/lib/session-authority-registry.mjs`: the one-line `syncDirectory` helper becomes a thin wrapper over a new exported `syncRegistryDirectory(path, {platform, fs})`.
  - On `win32`, a directory fsync failing with `EPERM`, `EINVAL`, `EISDIR`, `EACCES` or `ENOTSUP` counts as a succeeded write and returns `{durability:'unsupported', syncErrorCode}`; success returns `{durability:'synced'}`.
  - Any other platform, and any other error code on win32, still throws unchanged. The mirrored tolerant form already exists in `git-hook-runtime-snapshot.mjs` and `governance-scope.mjs`.
  - Platform and fs port are injectable parameters (defaults `process.platform` and `node:fs`); no global monkey-patching.
- `plugins/pipeline-core/lib/session-authority-registry-fsync.test.mjs` (new): 12 cases. Five codes tolerated on a simulated win32 with the warning field, the same five still thrown on linux, another code still thrown on win32, success reported as synced.
  Written first and RED against the original code (missing export), then GREEN.
- The call sites that run on win32 (the root directory sync after fragment handling and after the abandoned-fragment move) now survive the refusal; the lock-retire path already reported the same condition itself. Their return value is not surfaced further, since neither call site returns a result object.

## Checks

- New suite: 12 of 12 pass. `session-authority-lock-wait.test.mjs` stays green (see the report for counts).
- The held-patch check file (patch applies to the repository root, touches only the two files) passes.

## Not changed / not proven

- Not reproduced on Windows; the EPERM behaviour is simulated through the injectable port only.
- The new test file needs registration in the Verify suite list (done later by the Elephant; `harness/verify-suites.json` is untouched).
- The same `native-goldfish:namespace-drift` text was also seen on Linux after a heal, so the fsync is not shown to be its only cause; this slice does not investigate the others.
- Out of scope and still open: the `icacls` automation named by the plan row, and healing automatically after a hook stop with an integrated commit. `session-authority-repair.mjs` is untouched.
