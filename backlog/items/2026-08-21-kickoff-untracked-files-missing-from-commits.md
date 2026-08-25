---
schema: pipeline.backlog-item.v1
id: pipeline.kickoff-untracked-files-missing-from-commits
type: defect
owner: pipeline
status: closed
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

## Investigation, 2026-08-24 (read-only research fork)

**Root cause is more specific than the item's own framing.** There is no
staging/commit code in the onboarding library at all —
`applyProjectOnboardingV3()` (`plugins/pipeline-core/lib/project-onboarding-v3.mjs`,
own code comment, lines ~136-139) explicitly "never touches the Git index
itself (no `git add`/`git commit` anywhere in it)" — confirmed by grep,
zero `git add`/`git commit` calls anywhere in `project-onboarding-v3.mjs`
or `onboarding-continuity.mjs`. The actual initial commit is performed by
whichever agent runs onboarding, following that flow's own returned
`nextAction` text. So the real gap is most likely in the `nextAction`/
readback guidance an agent follows post-onboarding (candidate:
`pipeline-start-preflight.mjs` or the onboarding flow's own returned
instructions) not naming `docs/state.md` + PRD/spec explicitly as files to
stage — not a defect in `applyProjectOnboardingV3()` itself, which
deliberately stays git-free by design.

**`.onboarding-staging` confirmed genuinely ambiguous, not resolved.** Not
in the `.gitignore` seed (`PROJECT_IGNORE_SEED`, three entries only: `/scratch/`,
`/evidence/`, `/project/pipeline-state.json`), but its generator
(`buildOnboardingIntakeGeneratePlan`) frames its content as a pre-binding
"deterministic staging draft" with no cleanup/promotion/deletion logic
found anywhere in `onboarding-continuity.mjs` — its intended post-generation
lifecycle isn't fully specified in code either way. This still needs an
explicit owner call (track it as an audit trail, or add it to the gitignore
seed) before a fix touches it.

**Next step, not yet dispatched:** a follow-up dispatch should (a) locate
and fix the actual `nextAction`/readback guidance gap (read
`pipeline-start-preflight.mjs` and the onboarding flow's returned
instructions directly — not yet done by this investigation), confirming
`docs/state.md` + initial PRD/spec get explicitly named for staging, and
(b) separately resolve the `.onboarding-staging` lifecycle question before
deciding its own fate. Also confirm `docs/adr/0063-repository-directory-contract.md`'s
directory-kinds table directly (this investigation relied on prior session
context for that, not a fresh read) before finalizing.
- **Date:** 2026-08-24

## Part (a) landed, 2026-08-24

Commit `5ddbe60e` (`AGY-KICKOFFCOMMIT-1`): `kickoff-design.md` now names the
exact files an agent must stage once `kickoff apply` or `kickoff promote
apply` reports success — `docs/state.md` plus the generated PRD/Spec pair
for each. Independently re-verified: `git show --stat 5ddbe60e` (1 file, 17
insertions), `rg -n "onboarding-staging"` on the changed file returns no
match (part (b) correctly excluded). This is a prose-guidance fix, not
hook-enforced — same honesty class as the tool-budget base cap elsewhere in
this repo; a structured/enforced version would need a dedicated follow-up
touching `onboarding-continuity.mjs`, not attempted here.

**Part (b) (`.onboarding-staging`'s tracked/untracked fate) remains
genuinely undecided — item stays `open`.** Needs the PO's own call once
awake; nothing further to investigate from the repo alone per this
dispatch's own findings.

## Part (b) landed, 2026-08-25

PO decision (chat, 2026-08-25): `project/.onboarding-staging/` is
gitignored, not tracked — it is pre-binding scratch state (must be
authored and reviewed before binding, same class as `specs/kickoff-*`),
not a durable artifact. Applied: `/project/.onboarding-staging/` added to
this repo's own `.gitignore`, and the identical entry added to
`PROJECT_IGNORE_SEED` (`plugins/pipeline-core/lib/project-onboarding-v3.mjs`,
the single canonical source — no vendored duplicate of this file exists)
so every future onboarded project gets the same rule from the start.
`project-onboarding-v3.test.mjs`'s ignore-seed regression test
(`"onboarding seeds ignore rules..."`) asserts individual regex matches,
not full-text equality, so it is unaffected by the addition — confirmed by
reading the test directly before this change.

Both parts (a) and (b) are now resolved. Item closed.
