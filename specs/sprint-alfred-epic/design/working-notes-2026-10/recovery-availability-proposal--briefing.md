# Goldfish briefing: cleanup recovery availability

## Goal

Prepare an inert, reviewable scratch-only candidate that closes the active-feature cleanup recovery dead end. For an ordinary bound cleanup tuple whose closure remains active, emit the existing descriptor- and digest-bound `cleanup` command only when the owner observation has the exact schema, session ID, descriptor digest, and `not-live` status. Keep every uncertain owner state actionless, preserve the discarded-feature release proof, and preserve a safe exact action through the session-intent onboarding caller. Do not integrate production files or commit.

## Context files

Only these existing repository paths informed the candidate:

- `AGENTS.md`
- `architecture/map/index.md`
- `architecture/map/pipeline-core.md`
- `templates/prompts/goldfish-task.md`
- `plugins/pipeline-core/lib/session-cleanup-recovery.mjs`
- `plugins/pipeline-core/lib/session-cleanup-recovery.test.mjs`
- `plugins/pipeline-core/scripts/session-cleanup.mjs`
- `plugins/pipeline-core/scripts/session-cleanup-binding.test.mjs`
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs`
- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
- `plugins/pipeline-core/lib/onboarding-continuity.mjs`
- `plugins/pipeline-core/lib/worktree-lifecycle.mjs`
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`

The owned output is limited to `scratch/recovery-availability-proposal/`. No source, cache, lifecycle-state, or private-state file was changed.

## DoD checks

- Preserve an immutable baseline snapshot and complete candidate postimages for the six source/test files represented in `candidate.patch`.
- Provide a unified source patch and SHA-256 manifest binding every baseline and postimage, plus the patch digest.
- Include minimal regression coverage for exact cleanup argv from an exact `not-live` owner observation; no action for malformed, unknown, live, reused, unavailable, or throwing observations; unchanged neutral State bytes while planning; the human planner retaining exact safe cleanup and offering orphan release only when the actual orphan planner returns `ready`; continued discarded-feature release coverage; and session-intent onboarding propagation of the exact cleanup action.
- Attempt the named regression test directly before authoring the fix only if the guard admits it. Record the exact denial and leave the suite unverified if denied. No wrapper or alternate execution path may bypass the guard.
- Leave all candidate artifacts on disk and make no production integration or commit.

## Forbidden

Writes outside `scratch/recovery-availability-proposal/`; production integration; cache or private-state edits; blanket cleanup/release; feature discard/close; production guard widening; deleting or weakening existing tests; shell chaining, heredocs, or redirection; guard bypass; fabricated review, model, or proof receipts; commits, installs, or override flows; reads beyond the named existing real paths.

## Stop conditions

Stop if the real-path guard refuses a command without returning a safe action, owner custody is uncertain, or a required contract is missing. A missing source filename is a corrected-context issue, not authority to override the guard. If test execution is blocked but scratch writes remain admitted, finish the inert candidate and mark behavior unverified.

## Dispatch metadata

- Dispatch task: `cleanup_candidate_v2`
- Route: `gpt-6-luna` / `high`; optional native selector is blocked; no model attestation is claimed.
- Candidate base: commit `70e49364f7821e955c4f4458350f42f537180542`; tree `faec4c2646acd4de0f076c400b6756b4aaf33125`.
- Loaded ruleset SHA supplied by the dispatcher: `c971db395e66b4cb4c1aeadd9e4458cd44ac6d35c90b350a9f898e373dd09650`.
- Profile: Epic rigor 2, high risk, design prototype. Scratch-only, no-commit scope; candidate commit/tree are not applicable.
