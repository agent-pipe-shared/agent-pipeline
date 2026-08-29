---
schema: pipeline.backlog-item.v1
id: pipeline.undocumented-transcript-fallback-selects-wrong-file-by-mtime
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains plugins/pipeline-core/skills/pipeline-start/references/onboarding-recovery.md pipeline.deterministic-transcript-selection
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
