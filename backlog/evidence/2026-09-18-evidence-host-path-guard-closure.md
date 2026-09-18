# Evidence Host Path Guard Closure Evidence

**Backlog Item:** `pipeline.a-hand-written-evidence-artifact-can-still-carry-an-absolute-host-path`
**Date:** 2026-09-18
**Author:** Antigravity (Elephant orchestrator)
**Component:** `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`

## Problem & Analysis

`capture-evidence.mjs` safely redacts host paths from command outputs before writing to disk, but hand-written or directly written evidence artifacts under `backlog/evidence/` and `specs/*/evidence/` previously had no pre-write check in the guard layer. A developer or agent writing directly with write tools (`Write`, `Edit`, `NotebookEdit`, or `write_to_file` / `replace_file_content`) could inadvertently embed machine-specific absolute host paths (e.g. POSIX user home, macOS home, WSL paths, Windows drive paths) into tracked evidence artifacts. History cannot be rewritten once committed, making pre-write enforcement mandatory.

## Implementation Details

1. **Integrated Shared Detector:**
   - Single-sourced pattern detection by importing `findResidualHostPath` from `plugins/pipeline-core/scripts/capture-evidence.mjs` (avoiding vocabulary duplication/drift).
   - Exported `EVIDENCE_HOST_PATH_DENIAL_CODE = "GUARD-EVIDENCE-HOST-PATH"`.

2. **PreToolUse Write Path & Payload Inspection:**
   - Added `isEvidenceArtifactPath(repoPath)` covering `backlog/evidence/**`, `specs/*/evidence/**`, and `evidence/**`.
   - Added `extractWritePayload(toolInput, toolName)` extracting content across write tools (`content`, `new_string`, `CodeContent`, `ReplacementContent`, `new_source`).
   - In `evaluateLifecycleReadyGuard`, when writing to an evidence artifact path, inspects the write payload with `findResidualHostPath`.
   - If an absolute host path pattern is detected, the write is refused with exit code 2 under `GUARD-EVIDENCE-HOST-PATH`, reporting only pattern name and character offset (redacting the sensitive path from the diagnostic itself).
   - Integrates with `humanOverrideRoute` for explicit, audited human-in-the-loop override if needed.

## Verification

1. **Unit & Regression Test Execution:**
   - Executed `node plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`.
   - Verified 248/248 tests passed (duration ~20s), including:
     - `isEvidenceArtifactPath` target path matching and rejection of non-evidence paths.
     - `extractWritePayload` content extraction across tool input shapes.
     - Rejection of writes embedding POSIX home and Windows drive letter paths with safe diagnostics.
     - Admission of clean writes using `<repo-root>` and relative paths.
     - Unhindered writes to non-evidence files.

2. **Consumer-Safe Paths Audit:**
   - `node harness/scripts/check-consumer-safe-paths.mjs` passed cleanly.

All acceptance criteria satisfied. Item closed.
