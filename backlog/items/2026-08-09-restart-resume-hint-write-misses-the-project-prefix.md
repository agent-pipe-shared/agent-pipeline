---
schema: pipeline.backlog-item.v1
id: pipeline.restart-resume-hint-write-misses-the-project-prefix
type: defect
owner: pipeline
status: closed
created: 2026-08-09
source: "Live observation of the PO's private Codex+Pipeline 0.5.4 happy-path test run (fifth local candidate), 2026-08-09 (sanitized, no PO-identifying data)."
due: 2026-08-16
closed_at: 2026-08-17
closure_repository: self
closure_commit: bbbc0e01485e1e6c366df2280e3fe3fcaa95027c
closure_evidence: plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
---

# A pre-restart resume-hint write to the wrong path is denied and escalates to a full human-in-terminal ceremony instead of naming the one correct path

## What happened

Before a restart, `guard-lifecycle-ready.mjs` admits exactly one write target for
the resume-hint safety net: `project/.resume-hint-input.json`
(`isRestartResumeHintInputWrite()`, comparing the resolved write path against
`RESTART_RESUME_HINT_INPUT_PATH` exactly) — either via a direct file write or
via the `resume-hint.mjs capture` CLI shape
(`isRestartResumeHintCapture()`). In the observed run, the agent wrote the
card to the repository root (missing the `project/` prefix). The guard
correctly refused the mismatched path, but the refusal did not name the one
path that would have been accepted; instead, because
`guard-human-override.mjs`'s fallback override-planning threw (`HGO-GIT`/
`HGO-ROOT`/`HGO-COMMON-DIR` — see the sibling item on the escalation
mechanism itself), the denial escalated straight to the full
`HGO-EXTERNAL-REPOSITORY-OBSERVATION` "attended-host-terminal, human
copy-paste only" ceremony. The card was never persisted, and the session's
restart (triggered separately, by a language-selection detour) lost the
human's actual project intent entirely — the next session started from a
blank slate.

## Direction

For this specific denial (a write that misses only the `project/` prefix,
or otherwise fails `isRestartResumeHintInputWrite`/`isRestartResumeHintCapture`
by a narrow, diagnosable margin), the refusal message should name the exact
required path/argv shape directly, before any fallback to the generic
external-operator escalation — this is a self-correctable agent error, not a
case requiring a human. Consider also verifying that `project/` exists as a
directory at every point in the pre-kickoff flow where a restart-triggered
resume-hint capture can be required, in case a genuinely pristine root does
not yet have it.

## Related

- `2026-08-09-guard-denial-escalates-benign-commands-to-human-in-terminal.md` —
  the general escalation-fallback mechanism this specific case reaches.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, confirmed still live — remains current-scope, not
  deferred.
- **Rationale:** re-verified against current source,
  `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:1934-1959` — the
  `restartRequired` branch still falls straight from
  `isRestartResumeHintInputWrite`/`isRestartResumeHintCapture` to the
  generic `GUARD-LIFECYCLE-NOT-READY` block with no narrow-margin diagnostic
  naming the exact required path first. The gap described is unfixed.
- **Assignment (if accepted):** unassigned — a bounded guard-message
  improvement (name `project/.resume-hint-input.json` directly for a
  near-miss write before any external-operator escalation).
- **Date:** 2026-08-17

### Closed 2026-08-17 (overnight AFK block, NVA-MICRO-1)

Fixed exactly as proposed: a new `restartResumeHintNearMissWrite()`
detects a write sharing the resume-hint input file's exact basename at a
different resolved path, and `blocked()`'s denial message names
`project/.resume-hint-input.json` directly for that case, before falling
through to the generic message. Does not widen what is admitted
(`verdict(0)` still only from the exact-match branch); confirmed the
pre-existing property that `GUARD-LIFECYCLE-NOT-READY` never escalates to
the HGO external-operator ceremony either way. Independently re-verified:
`node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
(96/96, including the new regression test).
