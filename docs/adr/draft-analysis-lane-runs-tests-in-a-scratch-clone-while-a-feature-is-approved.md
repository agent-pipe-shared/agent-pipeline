# ADR: An analysis lane runs tests in a scratch clone while a feature is approved

Status: Proposed (draft for an independent review; the PO decided on 2026-11-03 for the scratch-clone lane; the build is a Goldfish slice after the review; EL-04)

Date: 2026-11-03

## Context

The Codex retrospective was explicitly allowed to analyse a closed local feature and ask for fresh product tests, and could not run them. The shell guard (`lib/guard/devplan-shell-lane.mjs`, function `opaqueScriptExecutionCandidate`) maps `node --test <file>` and every script run to an opaque-script write candidate with `forceLifecycleGate`. While the active feature's lifecycle is `approved` (before the implementation phase) the Dev-Plan gate therefore refuses it with `GUARD-DEVPLAN-SHELL: Feature "..." lifecycle is "approved"`.

The rule is deliberate: an opaque script can write source, which would let an agent implement before the implementation phase is open. The gap is that there is no sanctioned way to run tests whose output cannot touch the working tree. The result is a dead end for read-only work: retrospectives, second opinions and Critic follow-up checks cannot reproduce a green run, and the agent is pushed toward wrapper variants the guard also refuses.

## Decision (proposed)

1. **One sanctioned command, `analysis-run`.** It takes a commit (default `HEAD`) and one test command from the project's registered verify set (or a single test file path inside the commit). It creates a throwaway clone of that commit under `scratch/analysis/<run-id>/`, runs the command there with `TMPDIR` set inside the clone, captures bounded stdout and stderr and the exit status into `scratch/analysis/<run-id>/result.json`, and prints the result path and a one-line verdict. The clone is never a git worktree of the repository (no shared writable state), and the real working tree and the repository's control directory are not touched.
2. **The guard admits exactly that command.** The shell lane's catalogue of sanctioned commands gains `analysis-run` with a closed argument shape; every other script run stays refused as today. No lifecycle state changes, no signature is involved, the Dev-Plan gate semantics for the real tree are unchanged.
3. **Analysis results are labelled and never promoted.** The result record says `kind: analysis`, names the commit and the command, and states that it is not Verify evidence. Verify, Security and the close gate never consume it, so the lane cannot launder an approval.
4. **No isolation claim.** A test executes arbitrary code in the clone and could write elsewhere as the same user. The lane claims what it does: the working tree is not the target, and the result is labelled. Real isolation needs host sandboxing (see the control-plane scan decision of the same date).

## Consequences

- Retrospectives and audits can reproduce a test run in any lifecycle state; the agent no longer needs wrapper variants.
- Cost: a clone per run (size of the repository); a cleanup rule removes runs older than a bound.
- Test surface: the command catalogue, the shell lane, the result shape, a case showing that the working tree is byte-identical afterwards.

## Alternatives considered

- Allow `node --test` of known test files in the approved state: simpler, but a test file can write source into the tree, so the boundary the rule protects is opened.
- Open the implementation phase for the retrospective: forces a lifecycle change and a ceremony for read-only work.
- Leave it: the Codex finding stays; fresh runs remain impossible.

## Open questions for the review

1. Should the command run only registered verify commands, or also an arbitrary test file inside the commit?
2. Retention of `scratch/analysis/` and whether results may be committed as evidence of an analysis.
3. Is a read-only network policy for the run needed in this version?

## Not decided

Nothing is built by this draft. It needs an independent review (fresh context, ADR-0014 contract) before the slice is dispatched.
