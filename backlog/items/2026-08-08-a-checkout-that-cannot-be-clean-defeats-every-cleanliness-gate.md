---
schema: pipeline.backlog-item.v1
id: pipeline.a-checkout-that-cannot-be-clean-defeats-every-cleanliness-gate
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: Push gate of 2026-08-08 — two of the four failed attempts trace to this cause; the worktree workaround is currently carried as an instruction in docs/state.md rather than as a fixed mechanism
due: 2026-09-07
---

# A checkout that structurally cannot be clean defeats every cleanliness-gated tool

## Description

Two tracked files in this checkout are permanently modified by the runtime and
are never committed: `.claude/settings.json` and `project/resume-hint.json`.
Every tool that gates on a clean working tree therefore fails here by
construction, not because anything is wrong with the candidate:

- `harness/scripts/verify.mjs` closes its candidate preflight before running a
  single suite.
- `po-approval-gate.mjs prepare-critical` refuses via `observeCleanCandidate`,
  which requires `git status --porcelain=v1 --untracked-files=all` to be empty.

The established workaround is to run each of them against a detached worktree at
the candidate commit and copy the evidence artifacts back into the primary tree.
That works and is safe — the request binds candidate and plan/spec bytes, never a
path — but it is a procedure a human has to remember, and each artifact copy is a
place to get it wrong.

## Triggering situation

The push gate of 2026-08-08 stopped four times. Two of the four stops trace
directly to this cause: `prepare-critical` refusing the dirty tree, and a
security-evidence set copied back incompletely — the scan writes three paired
artifacts (`security-latest.json`, `security-latest.v2.json`,
`security-latest.v2.verdict.json`) and the guard checks the pair, so copying two
of three reports a stale-or-mismatched pair rather than a missing file.

The workaround has been rediscovered at least three times across sessions; it
currently survives only as an instruction in the handover and in per-machine
agent memory, neither of which is a mechanism.

## Affected artifact

- `harness/scripts/verify.mjs` — candidate preflight.
- `plugins/pipeline-core/scripts/po-approval-request.mjs` — `observeCleanCandidate`.
- `plugins/pipeline-core/scripts/worktree-create.mjs` — the existing worktree
  helper, which is the natural home for a supported form of this.
- `.claude/settings.json`, `project/resume-hint.json` — the two files that make
  the tree permanently dirty.
- `docs/state.md` — where the procedure currently lives instead.

## Proposal

Make the worktree route a supported mode rather than a remembered procedure.
Sketch, not a settled design:

- A single entry point that creates the detached worktree at a given candidate,
  runs the requested cleanliness-gated command inside it, copies **the complete
  artifact set** back, and removes the worktree — so the artifact set is defined
  in one place instead of in each operator's head.
- Alternatively, teach the cleanliness checks to ignore a declared set of
  runtime-owned paths. This is the smaller change but the more dangerous one: an
  ignore list is a hole in exactly the check that exists to bind evidence to an
  exact tree, and it would have to be justified per path rather than as a
  convenience.

The first option is preferred precisely because it keeps the checks strict.

Acceptance test: verify and a critical approval request both run from the primary
tree with no manual worktree step and no manual artifact copy, and the push guard
accepts the resulting evidence — demonstrated end to end, not asserted.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
