# PF-83: stop-failure diagnostic removed once the dispatch has succeeded (W7-PF83-STOP-FAILURE-REMOVED-C2-C1-20261027)

Status: targeted delivery green. Candidate e71a104a1e01a2f7b85e9044063ce86f5ee37906. The `.patch` replaces the earlier test-only partial patch
(`w7-pf83-stop-failure-removed-on-success.patch`) and carries the test half plus the production fix (2 files, +66/-6).

## Cause

Cleanup in `recordSubagentStopOutcome` was keyed by the name hash (session id, tool use id) and ran only when a SubagentStop was observed
(`diagnostic.stop`). A diagnostic of an earlier launch of the same dispatch (other tool use id), or a success through a foreground
PostToolUse (no `stop`), left the file behind. Recon claims re-verified against the clone; no contradiction found.

## Changed lines (lib/native-goldfish-host-finalizer.mjs)

- import `readdirSync`/`readFileSync` (aliases `stopReaddir`, `stopRead`) beside the existing fs aliases.
- `finalizeNativeGoldfishHostReturnInner`: after `const state = pending.state;` set `diagnostic.dispatch = { commonDir, dispatchId: state.binding.dispatchId }`.
- `recordSubagentStopOutcome({ stop, dispatch }, result)`: returns only when neither is present; on `authored-commit-recorded` reads every
  `stop-failure-*.json`, parses defensively (unreadable or no string `dispatchId` is left alone) and unlinks those whose `dispatchId` equals the
  succeeded dispatch; the failure-write branch stays behind `if (!stop) return;`.
- Comment above it: a success removes every diagnostic recorded for that dispatch.
No signature change outside the two slice files was needed (foreground PostToolUse is covered through `diagnostic.dispatch`).

## Tests (lib/native-goldfish-host-finalizer.test.mjs, +44 lines): helpers diagDir, diagEntries, plantDiagnostic, diagRecord; cases NGHF14, NGHF15, NGHF16

- RED (clone, unchanged production): NGHF14 failed on the planted other-tool-use-id diagnostic (actual `[ 'stop-failure-1111...1.json' ]`, expected `[]`);
  the reporter stops at the first failure, so NGHF15/NGHF16 were not executed RED. The setup of NGHF14 worked (transcript name agent-agent-bg.jsonl).
- GREEN (clone, patched): whole file tests 18, pass 18, fail 0; NGHF14, NGHF15, NGHF16 each pass.
- Baseline (clone2, unchanged): tests 15, pass 15, fail 0. Failing-name sets: both empty (identical); the three new cases are the only difference.
- Apply check: `git apply --check` of the patch in clone2 at the candidate, exit 0.
- No existing case changed.

## Not done

Retention pruning (3b second half), heal change, checkpoint outcome (D31), Full Verify, integrated Critic review (parent-owned batch gate), PO acceptance.
NGHF15/NGHF16 RED were not individually observed (reporter stops at first failure).

## Proposed commit message

fix(host-commit): remove a stop-failure diagnostic once the dispatch has succeeded

## Operator flow

Apply the diff, `git add -u` with a path limit to the two slice files, `--no-verify` commit, stamp, install.
Protected-path classification observed: neither slice file matches TP-1..TP-13; both are ordinarily editable.
