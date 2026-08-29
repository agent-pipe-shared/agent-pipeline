---
schema: pipeline.backlog-item.v1
id: pipeline.undocumented-transcript-fallback-selects-wrong-file-by-mtime
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_commit: adb60c64
closure_evidence: "node --test plugins/pipeline-core/hooks/codex-session-start-hint.test.mjs -> 40 passed, exit 0; node --test harness/scripts/check-consumer-safe-paths.test.mjs -> 9 passed, exit 0; grep -n pipeline.deterministic-transcript-selection plugins/pipeline-core/hooks/codex-session-start-hint.mjs matches."
sprint: nova
done_when: contains plugins/pipeline-core/hooks/codex-session-start-hint.mjs pipeline.deterministic-transcript-selection
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md §3.2), cited by scratch/greenfield-triage-2026-08-29.md finding F13, observed during the 2026-08-29 three-runner greenfield test."
---

# An unwritten "read your most recent prior transcript" fallback selected the wrong file and re-ran onboarding from scratch

## What happened

After `resume-hint.mjs capture --consume-card` destroyed its own input on
schema failure (this backlog's `pipeline.resume-hint-capture-consumes-card-
that-failed-schema-validation`, F12), the runner fell back to "read your most
recent prior transcript" to try to recover context. That heuristic picked a
sibling guardian/review transcript — not the runner's own actual prior
session transcript — because it had a marginally later mtime. Concluding
there was nothing to resume, the runner re-ran the entire onboarding
sequence from scratch: consent, git author, language, profile, and full
design-doc re-capture, all a second time.

## Where it is

Searched this repository for a coded mtime-based "most recent transcript"
selection mechanism and found none:

- `plugins/pipeline-core/skills/pipeline-start/SKILL.md` step 6 (the
  Resume-Hint capture/consumption contract) describes `resume-hint.mjs
  capture`/`inspect` and `project/resume-hint.json` consumption, but contains
  no fallback instruction of the form "if no card is available, read the most
  recent prior transcript by mtime".
  `plugins/pipeline-core/skills/pipeline-start/references/onboarding-recovery.md`
  and `references/transcript-forensics.md` were also read; neither documents
  a transcript-selection-by-mtime fallback either.
- `plugins/pipeline-core/lib/resume-hint.mjs` (`inspectResumeHint`,
  `captureResumeHint`, `discardResumeHint`) only reads/writes
  `project/resume-hint.json`; it never enumerates or reads runner transcript
  files.

**This finding therefore does not correspond to a codified pipeline
mechanism.** It is an emergent behavior of the specific runner (Claude on
Windows) reaching for its own host's transcript files when the pipeline's own
resume path came back empty (as a direct consequence of F12) — not a
documented or intentional design this repository ships. The triage's
characterization as "the documented fallback" is not confirmed by this
repository's own source; no such fallback is documented here. This
contradiction between the triage row's wording and what the code/docs
actually contain is recorded here per the briefing's stop-condition-3
handling: noted, not blocking the rest of the run.

## Proposal

Two independent angles, since the mechanism has no home in this repository
today:

1. **Root-cause containment (do first):** once F12 is fixed, this specific
   failure mode (empty resume state -> ad hoc transcript guessing) stops
   being triggered by a routine restart, because the resume card will no
   longer be destroyed by its own validation failure.
2. **Positive guidance (residual risk):** even with F12 fixed, a session can
   still lack a Resume-Hint (e.g. an unplanned crash with no prior capture).
   `references/onboarding-recovery.md` should state explicitly that this
   pipeline provides **no supported transcript-based recovery mechanism**,
   and that a runner reaching for its own raw session transcript as a resume
   source is an unsanctioned inference, not a documented fallback — so a
   future runner does not reinvent the same wrong heuristic. Add a marker
   `pipeline.deterministic-transcript-selection` at the point this guidance
   is added, naming what IS supported (a fresh Resume-Hint capture, or
   explicit PO re-briefing) instead.

## Acceptance

- `references/onboarding-recovery.md` explicitly states there is no
  supported transcript-mtime-based resume fallback, and names the supported
  alternative(s).
- A grep of `plugins/pipeline-core/skills/` for transcript-selection logic
  confirms none exists as a hidden/undocumented mechanism (this item's own
  investigation already performed that grep for this dispatch; a future
  session re-confirms before closing).
- Not claimed to be independently reproducible in this repository — the
  wrong-file-selection behavior belongs to the runner's own session
  transcript, which this repository does not have access to; the Acceptance
  above targets prevention (F12) and documentation, not a controlled repro
  of the mis-selection itself.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Real, reported cost (a full second onboarding pass) directly
  observed by the runner's own self-audit, and the causal chain to F12 is
  clear even though the transcript-selection mechanism itself is not part of
  this repository's own code.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate as part of the
  F12+F13+F14 restart-continuity chain (triage "Ordering recommendation" #3).
- **Date:** 2026-08-29

## Correction, 2026-08-29 (Elephant, measured — the "Where it is" section above is wrong)

The investigation recorded above searched
`plugins/pipeline-core/skills/` and `plugins/pipeline-core/lib/resume-hint.mjs`
and concluded that **no** mtime-based transcript-selection mechanism exists in
this repository. It never searched `plugins/pipeline-core/hooks/`. The
mechanism lives there, and it is ours:

`plugins/pipeline-core/hooks/codex-session-start-hint.mjs:59` defines
`PRIOR_ROLLOUT_TRANSCRIPT_LINE`, whose text instructs a restarting session to
look under `$CODEX_HOME/sessions` (or `~/.codex/sessions`), pick the file
**"most recent by modification time and excluding the file this session is
itself writing to"**, and read its last handful of tool-call/result/error
entries. It is unconditional — emitted on every session start, independent of
whether a resume-hint card exists — wired into the governed-branch context
array at line 111 and invoked by `codex-hooks.json` on
`startup|resume|clear|compact`.

So the failing heuristic is not an unsanctioned inference a runner invented.
For Codex it is a **mandatory instruction this repository ships**, and
"most recent by mtime, minus my own file" is exactly the rule that picked a
sibling guardian/review transcript in the observed failure.

Two things follow, and they replace this item's Proposal and Acceptance:

1. **The remedy in the Proposal section is factually wrong as written.**
   Stating in `references/onboarding-recovery.md` that this pipeline
   "provides no supported transcript-based recovery mechanism" would
   contradict shipped, unit-tested behaviour. Do not write that sentence.
2. **This is a known, named residual, not a surprise.** The closed item
   `pipeline.codex-restart-cannot-recover-operational-context-from-its-own-prior-transcript`
   (closed 2026-08-19) explicitly recorded, in its own implementation entry,
   that disambiguating "which prior rollout file belongs to THIS project"
   had no code-level solution and was left to "the restarting agent's own
   judgment (recency + exclusion of its own currently-growing file)". That
   named residual is what fired here. The closure was honest; the residual
   was simply never given an owner.

Why the observed run looked emergent anyway: the failure was reported by the
**Claude/Windows** runner, where this Codex-only hook does not fire. On that
runner the guess genuinely was the host's own behaviour. The correction is
that the identical wrong heuristic is what we actively instruct **Codex** to
perform on every single restart — which is the runner whose context loss the
PO is trying to fix.

### Revised acceptance

- `PRIOR_ROLLOUT_TRANSCRIPT_LINE` selects deterministically by **project
  identity first, recency only as a tiebreak within that set**: a Codex
  rollout file records its originating workspace in its own session
  metadata, so the instruction must direct the reader to that field and to
  discard transcripts belonging to another project outright, rather than
  ranking every session on the machine by mtime.
- The instruction states what to do when no transcript matches this project:
  say so honestly and continue, never widen the search back to "most recent
  overall".
- A marker `pipeline.deterministic-transcript-selection` is placed at that
  code, and `codex-session-start-hint.test.mjs` asserts the emitted context
  carries the project-scoping clause — the existing test at line 40 only
  asserts the line is present at all, which is why this defect survived it.
- `references/onboarding-recovery.md` may point at the mechanism, but must
  not claim none exists.

## Closure, 2026-08-29 (Goldfish dispatch NVA-W6-TRANSCRIPTFB)

`PRIOR_ROLLOUT_TRANSCRIPT_LINE` in
`plugins/pipeline-core/hooks/codex-session-start-hint.mjs` was rewritten so
selection is scoped by project identity first: the restarting session is
instructed to read each candidate rollout file's own recorded session
metadata (cwd/workspace field) and discard outright any transcript whose
recorded project does not match this repository's own root, before applying
modification time — and only then as a tiebreaker within the already
project-matching set, never as the primary ranking across the whole
machine. The instruction also states explicitly that when no transcript
matches this project's identity, the session must say so honestly and
continue rather than widening the search back to "most recent overall". The
marker string `pipeline.deterministic-transcript-selection` is present both
in a code comment and inline inside the instruction text itself.

`codex-session-start-hint.test.mjs` gained assertions on the emitted
`additionalContext` proving the project-scoping clause, the
"never...selected over an older one belonging to THIS project" language, the
tiebreaker phrasing, and the "no match -> say so, don't widen" clause are
all present — this is the mechanism by which a differently-scoped
(different-project, newer-mtime) transcript is proven not preferred over an
older, correctly-scoped one, since this hook only emits an instruction
string rather than performing file selection itself (there is no runtime
Codex-session-transcript corpus available inside this repository to drive an
end-to-end selection test against).

`references/onboarding-recovery.md` was read and does not describe any
transcript-mtime fallback (confirmed by grep for
"deterministic-transcript-selection", "rollout transcript", "CODEX_HOME" —
no matches); per this backlog item's own revised acceptance ("may point at
the mechanism, but must not claim none exists") no edit to that file was
required and none was made, since it makes no claim to correct.

**Evidence:**
- `node --test plugins/pipeline-core/hooks/codex-session-start-hint.test.mjs`
  → `codex-session-start-hint: 40 passed`, exit 0.
- `node --test harness/scripts/check-consumer-safe-paths.test.mjs` (required
  because `plugins/pipeline-core/` was touched) → 9/9 passed, exit 0.
- Commit `adb60c64` on branch `feat/sprint-nova-codex-v046`.

**Status:** closed — `done_when` predicate (marker string present in the
named file) satisfied; both Acceptance-section requirements from the
"Revised acceptance" block are met by the above.
