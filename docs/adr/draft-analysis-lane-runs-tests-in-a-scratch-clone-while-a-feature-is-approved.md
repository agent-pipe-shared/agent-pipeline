# ADR: An analysis lane runs tests in a scratch clone while a feature is approved

Status: Proposed (draft for an independent review; the PO decided on 2026-11-03 for the scratch-clone lane; the build is a Goldfish slice after the review; EL-04)

Date: 2026-11-03

## Context

The Codex retrospective was explicitly allowed to analyse a closed local feature and ask for fresh product tests, and could not run them. The shell guard (`lib/guard/devplan-shell-lane.mjs`, function `opaqueScriptExecutionCandidate`) maps `node --test <file>` and every script run with arguments or outside `scratch/` to an opaque-script write candidate with `forceLifecycleGate`. The one exemption is exactly `node scratch/<name>.mjs` with no further argument (AC-207, draft-phase scratch scripts); that exemption does not consult the lifecycle state, so the boundary is already open for a bare scratch script, and candidate 19 patch w131 now scans such a script for the control-plane directory. While the active feature's lifecycle is `approved` (before the implementation phase) the Dev-Plan gate therefore refuses it with `GUARD-DEVPLAN-SHELL: Feature "..." lifecycle is "approved"`.

The rule is deliberate: an opaque script can write source, which would let an agent implement before the implementation phase is open. The gap is that there is no sanctioned way to run a registered test command against a commit with a recorded postcondition on the working tree, and with a label that stops the result from being mistaken for Verify evidence. The result is a dead end for read-only work: retrospectives, second opinions and Critic follow-up checks cannot reproduce a green run, and the agent is pushed toward wrapper variants the guard also refuses.

## Decision (proposed)

1. **One sanctioned command, `analysis-run`.** It takes a commit (default `HEAD`) and one test command from the project's registered verify set; an arbitrary test file path is not accepted in this version. It creates a throwaway clone of that commit in the control directory of the git common directory (`agent-pipeline/analysis/<run-id>/`, outside the working tree, so it is never an untracked entry and never breaks the clean-tree precondition of a signature ceremony, which `scratch/` would in a hosted project), runs the command there with `TMPDIR` set inside the clone, captures bounded stdout and stderr and the exit status into the run's `result.json`, and prints the result path and a one-line verdict. The clone is never a git worktree of the repository (no shared writable state).
   **Runtime postcondition:** the command records `git status --porcelain=v1 --untracked-files=all` and HEAD of the real working tree before and after the run and writes `workingTreeUnchanged: true|false` into the result; a changed tree makes the verdict a refusal-class result with the repair named (review and revert the change), never a silent pass.
2. **The guard admits exactly that command.** The shell lane's catalogue of sanctioned commands gains `analysis-run` with a closed argument shape; every other script run stays refused as today. No lifecycle state changes, no signature is involved, the Dev-Plan gate semantics for the real tree are unchanged.
3. **Analysis results are labelled and never promoted.** The result record says `kind: analysis`, names the commit and the command, and states that it is not Verify evidence. Verify, Security and the close gate never consume it, so the lane cannot launder an approval.
4. **No isolation claim; the owner of the residual is named.** A test executes arbitrary code in the clone and could write elsewhere as the same user, including the real working tree by an absolute path. This lane does not prevent that; it detects a changed working tree afterwards (point 1) and labels the result. Real isolation needs host sandboxing. Residual owner: the PO list entry "host sandboxing for test execution" (opened with this ADR, due before the 0.8 candidate); the control-plane script scan of candidate 19 patch w131 (a static, partial check of scripts run through `node`) is the related existing mitigation, not a substitute.

## Consequences

- Retrospectives and audits can reproduce a registered test run in any lifecycle state; the agent no longer needs wrapper variants.
- Cost: a clone per run (size of the repository); a cleanup rule removes runs older than a bound.
- Test surface: the command catalogue, the shell lane, the result shape, a case in which the working tree is byte-identical afterwards (`workingTreeUnchanged: true`) and a case in which a run that touches the tree is reported as such.

## Alternatives considered

- Allow `node --test` of known test files in the approved state: simpler, but it has neither the commit-bound clone, nor the postcondition on the working tree, nor the `kind: analysis` label. Both lanes execute arbitrary test code; the chosen one adds detection and labelling, it does not add isolation.
- Open the implementation phase for the retrospective: forces a lifecycle change and a ceremony for read-only work.
- Leave it: the Codex finding stays; fresh runs remain impossible.

## Open questions for the review

1. Retention of the analysis runs in the control directory and whether results may be committed as evidence of an analysis.
2. Is a read-only network policy for the run needed in this version?

(Resolved by the review of 2026-11-03: registered verify commands only, see point 1.)

## Review disposition (independent Critic review of 2026-11-03, findings F4, F5, F9, F10 of this document)

- F4 (clone inside the working tree): fixed, the clone lives in the control directory.
- F5 (the lane shares the flaw it used to reject the alternative): fixed, the contrast is stated honestly, a runtime postcondition was added, arbitrary test files are out.
- F9 (Context misstated the shell-lane boundary): fixed, the AC-207 exemption is stated.
- F10 (residual without an owner): named as a PO list entry with a due point; the entry is added to the PO list of the plan.

The revised text has not had a second review; the review budget is spent on a working local candidate first (PO decision 2026-11-03).

## Not decided

Nothing is built by this draft. It needs an independent review (fresh context, ADR-0014 contract) before the slice is dispatched.
