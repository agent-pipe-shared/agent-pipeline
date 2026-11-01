# w40 — audit bundle flush works on native Windows and the failure names its cause (15f close hotfix)

Found by the first real consumer run of the audit route on native Windows: the close plan passed, the apply refused with
`FCA-BUILD-OR-RECEIPT-FAILED` ("audit bundle did not verify"), although the bundle verified on its own.

## Cause (read in code, reproduced by the consumer)

`lib/feature-close-audit-executor.mjs` flushed each bundle file through `openSync(path, "r")` + `fsyncSync`. On Windows,
`FlushFileBuffers` needs write access, so a read-only handle always throws `EPERM`. The generic catch turned that into the
code above and the coordinator into "audit bundle did not verify", hiding the cause. A bundle artifact copied from a read-only
source (`006-candidate-evidence`, mode 0444) cannot be opened for writing at all, so a write-capable handle alone is not enough.

## Change

- `syncAuditBundleFile(path, deps)` (exported): POSIX keeps the read-only handle; win32 opens `r+` first. On win32 only, a
  refused open or flush (`EPERM`, `EACCES`, `EBUSY`, `EINVAL`, `ENOTSUP`) returns `{status:"unsupported"}` instead of failing, the
  same posture the directory flush already had. Any other error still fails. The bundle bytes are verified right after by
  `validateFeatureCloseAuditReceipt`, so a skipped flush never skips verification.
- The generic catch now appends `Cause: <code> <message>` to `detail`; `close-coordinator.mjs` appends that detail to its refusal.
- Tests (in the already registered `feature-close-audit-executor-tests` suite, no new registration): the flush policy per
  platform and error code, and the cause text through the real executor.

## Scan of the rest of the close chain (read, not run on Windows)

Every other `fsyncSync` in `close-coordinator`, `publication-close-journal`, `private-boundary` and `pipeline-state.mjs` sits on a
descriptor opened for writing, and the directory flushes tolerate the Windows codes. This was the only read-only file flush in
the chain. Not run natively: the close-feature State writer, tracked-close-finalized, cleanup receipt.

## Retry on the consumer

The bundle left by the failed run is complete and verified; the plan reports `reuse-verified`, so the retry flushes and writes
the receipt without rebuilding. Nothing needs deleting.
