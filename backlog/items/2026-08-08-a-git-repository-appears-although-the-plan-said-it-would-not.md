---
schema: pipeline.backlog-item.v1
id: pipeline.git-appears-despite-initializes-git-false
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Structured handover from the greenfield happy-path test of the local 0.5.4 build, 2026-08-08 (defect D-4)."
---

# A Git repository appears although every plan said it would not

## What was observed

Throughout onboarding, `inspect` and `plan` reported `initializesGit: false` and a
repository status of `local-uninitialized`. After the seed and kickoff sequence,
`.git` existed: branch `main`, no commit, everything untracked.

So either the field is misleading — it means something narrower than "this run will
not create a Git repository" — or a step initializes one without disclosing it.

## Why a small defect is worth a filed item

The onboarding surface's entire claim is that a human can watch a governed sequence
and see, in advance, what each step will do. `initializesGit` exists to make one
specific effect predictable. A predicted effect that does not match the observed
effect damages the value of every other prediction on the same surface, including
the ones that matter more.

The severity is genuinely low: an empty repository with no commit is trivially
reversible and harms nothing. It is filed because it is cheap to resolve and
because "the disclosure was wrong" is the kind of finding that gets waved through
individually and accumulates.

## Direction, not a design

1. **Determine which of the two it is** before designing anything: an inaccurate
   field, or an undisclosed initialization. They have opposite fixes.
2. If the field is accurate for its own step but another step initializes, the
   disclosure belongs to whichever step actually does it — a per-step boolean that
   is true of the step and false of the run is a trap.
3. Pin the resulting contract with a check over a genuinely uninitialized fresh
   root, since this is only observable before the first commit.

## Triggering situation

Fresh directory with no `.git`, local `0.5.4+claude` build, Claude runner, full
seed-through-kickoff sequence. Not reproducible in this repository.

## Related

- `2026-08-08-kickoff-apply-action-drops-the-runner-the-plan-was-made-for.md` —
  same run, same surface; there the returned action was incomplete, here the
  returned prediction was wrong.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
