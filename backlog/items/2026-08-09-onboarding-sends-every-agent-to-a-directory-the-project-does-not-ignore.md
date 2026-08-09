---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-does-not-ignore-the-scratch-directory-it-mandates
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Left open by 2026-08-08-shipped-guidance-sends-agents-to-a-directory-a-gate-refuses.md, whose closure evidence (backlog/evidence/2026-08-09-devplan-scratch-exemption-closure.md, 'What this closure does NOT decide') recorded it as a direction rather than deciding it; carried in docs/state.md as an open item needing its own backlog entry."
due: 2026-08-23
---

# Onboarding mandates `scratch/` and leaves it untracked-and-unignored in every consumer project

## Description

The Pipeline now sends every agent to one directory for every temporary file.
`plugins/pipeline-core/skills/pipeline-start/SKILL.md:37-55` names `scratch/` as
the only sanctioned location, the containment guard permits it without an
exception, and `guard-devplan`'s `DEFAULT_EXEMPT_PREFIXES` carries it in every
phase including `draft`. Writing there is now the instructed behaviour, not a
fallback.

Nothing puts `scratch/` into the consumer's `.gitignore`. The skill says so
outright — "Onboarding does not add `scratch/` to your `.gitignore` — add it
yourself if you want these files kept out of history" (`SKILL.md:53-55`) — and a
search over the whole plugin finds no code path that writes or creates a
`.gitignore` at all. So in every adopting project the files the Pipeline
instructs its agents to create are untracked and visible.

This repository does not feel it, and that is the whole difficulty: `.gitignore`
here carries `scratch/` at line 20, so the mandated directory is invisible to
every check that reads the working tree. The instruction was written and tested
in the one repository where it has no consequence.

## Triggering situation

The dev-plan exemption item
(`2026-08-08-shipped-guidance-sends-agents-to-a-directory-a-gate-refuses.md`) was
closed on 2026-08-09. Its closure evidence records this question in a section
titled "What this closure does NOT decide", and its Triage recorded it as a
direction. `docs/state.md`'s current section lists it among the items left
deliberately open, with "needs its own backlog item" attached. This is that item.

## Affected artifact

- `plugins/pipeline-core/skills/pipeline-start/SKILL.md:37-55` — the scratch-space
  paragraph, including the sentence that states the gap.
- `plugins/pipeline-core/lib/guard-devplan-policy.mjs:42` —
  `DEFAULT_EXEMPT_PREFIXES`, which carries `scratch/`.
- `plugins/pipeline-core/lib/session-cleanup-recovery.mjs:1334` — the scratch
  descriptor binding, whose comment states the location is "already gitignored,
  already inside the guard's project-root containment boundary". The second half
  holds everywhere; the first half is a property of *this* repository asserted as
  a property of the design. This is one more instance of
  `2026-08-08-shipped-artifacts-assume-the-pipelines-own-repository.md`.
- Whatever onboarding path would own the write, if the answer is "write it":
  `plugins/pipeline-core/lib/project-onboarding-v3.mjs` /
  `onboarding-continuity.mjs` seeding.

## The consequence, verified rather than assumed

`plugins/pipeline-core/scripts/security-scan.mjs:283` reads the candidate's
working tree with `git status --porcelain=v1 --untracked-files=all`, and
`:292-303` maps a non-empty result to `status: "dirty"`, `reason:
"working-tree-not-clean"`. Untracked files count. So in a consumer project, an
agent that follows the Pipeline's own instruction to write a probe script under
`scratch/` makes the next security-scan candidate dirty — and the shipped
guidance is the direct cause.

Two further consequences follow from the same fact and need no separate
mechanism: `git add -A`, which is ordinary, sweeps scratch files into a commit;
and the directory accumulates in `git status` until a human notices, which is the
condition `2026-08-08-temp-directories-leak-until-the-filesystem-refuses-every-write.md`
already describes for host temp.

## Proposal

Three candidates, and the disagreement is about a boundary, not about the
mechanics.

1. **Onboarding appends `scratch/` to the project's `.gitignore`, creating the
   file when absent.** Idempotent, one line, anchored (`/scratch/`, per the
   lesson of `pipeline.over-broad-ignore-rule-swallows-closure-evidence`), and
   only ever appending — never rewriting or reordering what the project already
   wrote. Cost: the seed writes into a file the project owns, in a repository the
   Pipeline is otherwise careful not to author. It is also the only candidate
   that closes the security-scan consequence above without asking anyone.
2. **Ask it as a bootstrap question.** SETUP-3 landed the bootstrap-question
   machinery, so there is now a place to put it, and the two existing questions
   (operator language, PO profile) establish that a seed may ask before it
   writes. Cost: one more question on every greenfield start, for a decision most
   adopters have no opinion about.
3. **Leave it, and make the guidance carry the consequence.** The skill already
   states the gap; it does not state what follows from it. Cost: the Pipeline
   keeps instructing agents to do something whose consequence it has measured and
   declined to prevent. This is the honest version of the status quo, not the
   status quo — today the sentence reads as a note, not as a warning.

Whichever is chosen, `session-cleanup-recovery.mjs:1334` needs correcting: it
currently asserts the ignored-ness as given.

Recommendation: (1), with (2) only if the PO wants no unasked write into a
project-owned file. (3) is a real option but it leaves a defect the Pipeline
caused in a consumer's repository.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
