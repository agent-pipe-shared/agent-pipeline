# w109 - SPDX header for the fsync suite and no apostrophe in the late-verify pattern

## What

Two pins the Full Verify of candidate 18 (run on the rehearsed tree, 2026-11-02) found as real, candidate-caused reds:

- `license-contract-check`: `plugins/pipeline-core/lib/session-authority-registry-fsync.test.mjs` (added by w81) had no `// SPDX-License-Identifier: SUL-1.0` line in its first three lines. The line is added.
- `verify-case-completion-check`: `pipeline-state-late-verify-tests` was reported `VULNERABLE-UNREGISTERED`. Cause: w89 added `assert.match(gateText, /runner'?s? permission layer may refuse/u)`; the classifier's masker reads the apostrophe in the regex as a string start, hides the second `test(` call and so classifies the two-test file as "one node:test case". The pattern becomes `/permission layer may refuse/u` (same statement, no apostrophe) with a comment saying why.

## Why

Both are one-line defects introduced by earlier candidate 18 patches, found only by the whole-tree checks.

## Verification (orchestrator, in a clone at the chain end)

`check-license-contract.mjs` PASS; `check-verify-case-completion.mjs` valid (388 entries, 367 classified, the baseline numbers); `pipeline-state-late-verify.test.mjs` 2/2. Patch applies to the chain end (`apply --check` exit 0).

## Apply order

After w108 (last patch of the chain).

## Not proven

Whether more reds of that Full Verify are candidate-caused is decided by re-running the red suites alone below the home directory (the FV clone had been placed under `/tmp`, which turned most of them red); further fixes, if any, are separate deltas.
