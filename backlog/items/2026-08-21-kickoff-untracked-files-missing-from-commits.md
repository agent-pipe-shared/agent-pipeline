---
schema: pipeline.backlog-item.v1
id: pipeline.kickoff-untracked-files-missing-from-commits
type: defect
owner: pipeline
status: open
created: 2026-08-21
source: Manual observation during sprint_agy kickoff testing (Rune_Test1_Agy_060_59)
---

# Kickoff and fresh onboarding leaves governance artifacts untracked and uncommitted

## Description

During fresh-project onboarding and kickoff execution (`project-onboarding-v3.mjs`), critical governance files and directories (such as `docs/state.md`, `project/.onboarding-staging/`, and staged PRD/Spec artifacts) are generated on disk. However, the initial commit created during onboarding only tracks `project/critical-human-proof.json`. The remaining governance artifacts are left as untracked files in the working directory.

As a result:
1. `git status` remains dirty immediately after completed kickoff onboarding.
2. A subsequent push or branch checkout risks leaving these critical state and specification files behind on the local machine.
3. Other team members cloning the repository will receive an incomplete project state lacking `docs/state.md` and initial design packages.

## Triggering situation

Observed during `sprint_agy` smoke testing on `Rune_Test1_Agy_060_59`. After `pipeline-start` reported `onboarding-status: ready`, `git status` showed `docs/` and `project/.onboarding-staging/` as untracked files, with only `project/critical-human-proof.json` included in commit `9d31ff9`.

## Affected artifact

`plugins/pipeline-core/scripts/project-onboarding-v3.mjs`, `plugins/pipeline-core/lib/onboarding-continuity.mjs`

## Proposal

Ensure `project-onboarding-v3.mjs` stages and commits all generated baseline governance artifacts (`docs/state.md`, initial PRDs, specifications, and pipeline configs) in the initial repository baseline commit, ensuring a clean working tree and ensuring all necessary project state is included in subsequent pushes.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, scope narrowed pending one confirmation.
- **Rationale:** The core claim (`docs/state.md`, the canonical handover
  file, and the initial PRD/spec left untracked after "ready") is a real
  gap — `docs/state.md` should always be committed. The item's own example
  list also names `project/.onboarding-staging/`, which a quick check this
  session suggests may be intentionally transient: it is written by a
  "deterministic staging draft" checkpoint-generate flow whose own render
  says the content "must be authored and reviewed before binding" (i.e. it
  is pre-binding scratch state, akin to `specs/kickoff-*`), and neither
  `docs/adr/0063-repository-directory-contract.md` nor this repo's root
  `.gitignore` mentions it either way. Adding it to the commit list without
  confirming its intended lifecycle risks committing draft state that's
  meant to be superseded, not kept.
- **Assignment (if accepted):** this sprint — a small `implementor`-tier
  dispatch: (a) commit `docs/state.md` + initial PRD/spec unconditionally,
  (b) confirm `.onboarding-staging`'s intended lifecycle (transient vs.
  durable) before deciding whether it belongs in the same commit or in a
  project `.gitignore` entry instead. Not done in this pass.
- **Date:** 2026-08-24
