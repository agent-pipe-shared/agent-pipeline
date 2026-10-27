# PF-83 slice (3a+3b): stop-failure diagnostic removed on success (W7-PF83-STOP-FAILURE-REMOVED-ON-SUCCESS-C1-20261027)

Status: INTERIM, BLOCKED at the budget checkpoint (call 28 of 35). Candidate 03a8aa27cb246243d847065280931d1ff4aba64e.
The paired `.patch` holds the TEST HALF ONLY (three new cases, +44 lines in `native-goldfish-host-finalizer.test.mjs`).
There is NO production change yet; do not apply the patch as a fix.

## Re-verified recon claims (lib/native-goldfish-host-finalizer.mjs at the candidate)

- `recordSubagentStopOutcome` lines 155-169; unlink only on `authored-commit-recorded` (line 161) and only for the name hash of
  session id + tool use id. Directory is already `.git/agent-pipeline/run/native-goldfish-host-diagnostics` (D180b), so only the
  removal half is open.
- `diagnostic.stop` is set only in the SubagentStop branch (line 271). A PostToolUse (foreground) success has no `stop`, so
  `recordSubagentStopOutcome` returns at once and removes nothing for that dispatch. Recon hypothesis confirmed in code.
- Warning text at line 152 ("A later success removes it") holds only for the identical session + tool-use key.

## Cause

Cleanup is keyed by name hash (session id, tool use id) and runs only when a SubagentStop was observed. A diagnostic from an
earlier launch of the same dispatch (another tool use id), or a success via PostToolUse, leaves the file behind.

## Test half (in the patch)

Helpers `diagDir`, `diagEntries`, `plantDiagnostic`, `diagRecord` before `fixture`; cases ids ascending after NGHF13:
- NGHF14: real handback stop failure writes one diagnostic; a second diagnostic of the same dispatch (other tool use id) is planted;
  a SubagentStop success without handback must leave the directory empty. Expected RED on the planted file.
- NGHF15: foreground PostToolUse success must leave no diagnostic of its dispatch. Expected RED.
- NGHF16: success never removes a diagnostic of ANOTHER dispatch, an unreadable file or one without a dispatch id; the same dispatch's
  planted file is removed. Expected RED only on the own-dispatch removal.

RED state actually observed: NOT reached. First runs failed in NGHF14 setup (my transcript fixture used the wrong file name
`agent-bg.jsonl`; the finalizer reads `agent-<agent_id>.jsonl` = `agent-agent-bg.jsonl`, giving NGHR-CLAUDE-STOP-CORRELATION and no
diagnostic). The name is corrected in the patch, but the corrected file was never run. The reporter stops at the first failing case,
so NGHF15/NGHF16 were never executed. A debug message was added to one assertion in NGHF14 (harmless, may stay).

## Planned production change (not done)

1. After `const state = pending.state;` (about line 279) set `diagnostic.dispatch = { commonDir, dispatchId: state.binding.dispatchId }`.
2. `recordSubagentStopOutcome({ stop, dispatch }, result)`: on `authored-commit-recorded`, read every `stop-failure-*.json` in the
   diagnostics directory, parse defensively (unreadable or no `dispatchId` file left alone), unlink those whose `dispatchId`
   equals the succeeded dispatch; keep the failure branch behind `if (!stop) return`.
3. Correct the comment at line 152 to say a success removes every diagnostic recorded for that dispatch.

## Not done

Production edit, GREEN run, whole-file run in clone and clone2 (baseline vs patched failing-name sets), apply check, retention
pruning (3b second half), heal change, checkpoint outcome (D31). Counts: none to report.

## Proposed commit message

fix(host-commit): remove a stop-failure diagnostic once the dispatch has succeeded

## Operator flow (for the finished patch)

Apply the diff, `git add -u` with a path limit to the two slice files, `--no-verify` commit, stamp, install.
Protected-path classification observed: neither slice file matches TP-1..TP-13; both are ordinarily editable. An independent
Critic review stays a parent-owned batch gate.

## Recovery

Clones remain at `scratch/agent-out/w7xx/clone` (test edits, no production edit) and `clone2` (baseline); driver
`scratch/agent-out/w7xx/driver.mjs` (modes setup, setup2, run, patch, check, cleanup). Cleanup was NOT run.
