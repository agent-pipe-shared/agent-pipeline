# Held patch notes: w7-g23-export-bounds-identity (G23.forensics Slices A and B)

Candidate d9d9e1ef01c06a5459278a49d3a7761ee5a1ebbd. Patch: `w7-g23-export-bounds-identity.patch` (git diff --binary of a scratch clone against the candidate; two files: `plugins/pipeline-core/scripts/runner-transcript-recovery.mjs`, `plugins/pipeline-core/scripts/runner-transcript-recovery.test.mjs`). Nothing under `plugins/` was edited in the repository.

## Cause

`exportRunnerTranscript` had no completeness marker: skipped lines, the silent 2000-candidate enumeration cap and not-inferred child sessions were indistinguishable from a whole session (recon gap 1/2). `--exclude-session` was an unverified free string on export/list/read (recon gap 5). The recon cited lines (MAX_CANDIDATES cap, no completeness field, unchecked exclude-session) were re-verified against the clone and held.

## Changes (Slice A and B, both done)

- Import `resolveModelRoleHostSessionIdentity`; new `claimedSessionConflict()` returns `{status:"unavailable", reason:"MODEL-ROLE-SESSION-IDENTITY-CONFLICT"}` when the host identity conflicts (Codex env pair) or differs from `--exclude-session`; an identity the host cannot supply is not compared. Called first in `listRunnerTranscripts`, `readRunnerTranscript`, `exportRunnerTranscript`. Legacy `recoverRunnerTranscript` and `audit-current` unchanged. Guard argument grammar and `sanctioned-args-scripts.mjs` untouched.
- `regularJsonlFiles` and `claudeProjectCandidates` report `boundReached` (an entry remained when the cap was hit); an optional `limits` test seam (`maxCandidates`, `maxSegmentBytes`) is threaded through; the CLI never passes it.
- Export result gains `completeness` ("complete"|"partial"), `incompleteReasons` (`records-skipped`, `candidate-bound-reached`, `byte-ceiling`) and `childSessions: "not-inferred"`. Under a byte ceiling only whole lines inside the ceiling are described; sha256 and byteLength still identify the whole file.

## Evidence

Driver: `node scratch/agent-out/w7x/driver.mjs run LABEL plugins/pipeline-core/scripts/runner-transcript-recovery.test.mjs` (scratch, untracked). Reporter is not TAP.
- RED (unchanged production code, 6 new cases): exit 1, 6 failing, all new: completeness; candidate-bound-reached; byte-ceiling; identity mismatch on export/list/read; Codex env pair conflict; CLI conflict.
- GREEN (final state, log green2): exit 0, `tests 18, pass 18, fail 0` (12 pre-existing + 6 new).
- Baseline versus patched failing-name sets in clone2: NOT DONE (budget). Baseline is the pre-existing 12 cases, which pass in the patched clone; the unchanged-code baseline run was not executed.
- `git apply --check` in clone2: NOT DONE (budget); clone2 was never created. The patch is a diff of a clone against the exact candidate.

## Existing cases updated (written justification, not weakened)

- Export case 1: pinned key list gains `childSessions`, `completeness`, `incompleteReasons`; plus an assertion `completeness === "partial"` (the fixture holds a damaged line).
- Export CLI case and read `main` case: `main` reads `process.env`, so `CODEX_SESSION_ID`, `CODEX_THREAD_ID`, `CLAUDE_CODE_SESSION_ID` are pinned to `current-session` (restored afterwards) so an ambient host session cannot conflict. Hermeticity only.

## NOT done

Coordinator addendum: the clone2 baseline whole-file run was taken by the parent (unchanged candidate: tests 12, pass 12, fail 0; failing-name sets empty and identical to the patched 18/18 minus the six new cases), the apply check in clone2 passed (exit 0) and both clones were removed. Still not done: legacy `recover` op identity check; recon items 3, 4 (Claude audit-current), 6, 7; Full Verify; independent Critic review (parent-owned batch gate); PO acceptance.

## Proposed commit message

feat(forensics): mark transcript export completeness and refuse a conflicting claimed current session

## Operator flow

Apply the diff (`git apply` of the .patch), `git add -u` limited to the two plugin paths, commit with `--no-verify` per the held-patch ceremony, stamp, install. Protected-path classification: neither changed file matches a TP-1..TP-13 pattern in `templates/prompts/agent-obligations.md` §2; both are ordinary editable plugin files, and the edits were made in a scratch clone only.
