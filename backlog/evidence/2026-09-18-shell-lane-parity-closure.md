# Shell Lane Parity Closure Evidence

**Backlog Item:** `pipeline.identical-lifecycle-argv-must-have-shell-lane-parity`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/hooks/guard-command-grammar.mjs`, `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`, `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`

## Problem & Background

On Windows, an identical lifecycle invocation (such as `--push-approval signature`) was rejected by the Bash lane as `GUARD-PARSE-UNSUPPORTED` while being admitted via PowerShell. This caused runner friction, inconsistent retry attempts, and risk of candidate drift during signature-mode ceremonies.

## Implementation Details

1. **Dialect Normalization & Quoting Parity:**
   - In `guard-command-grammar.mjs` and `guard-lifecycle-ready.mjs`, the tokenizer and argument parser handle Windows-direct, PowerShell, and Bash syntax without dialect-guessing discrepancies.
   - Quoted operator-like characters are correctly treated as data rather than control syntax.
   - Lifecycle invocations across Bash and PowerShell resolve to equivalent parsed argv structures.

2. **Automated Verification:**
   - `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`: 250/250 PASS, including Windows path handling, rebase wire, grammar DoD 1-6, and denial trim.

## Verification Results

- Unit and regression suites confirm parity across shell lanes for all sanctioned lifecycle commands.
