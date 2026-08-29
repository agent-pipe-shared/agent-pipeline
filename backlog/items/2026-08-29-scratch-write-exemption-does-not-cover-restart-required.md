---
schema: pipeline.backlog-item.v1
id: pipeline.scratch-write-exemption-does-not-cover-restart-required
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_commit: 9639d91ee78f42ca0fbe6c3a424321a9d3c492d8
closure_evidence: plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs
sprint: nova
done_when: contains plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs RESTART_LIFECYCLE_SCRATCH_WRITE
source: "Claude/Windows self-audit section 3.2 from the 2026-08-29 three-runner greenfield test (finding F23 of scratch/greenfield-triage-2026-08-29.md); Codex on the same runtime-restart mechanism could not persist its own audit report and delivered it in chat instead (the exact 'exists only in chat' failure GL-07 forbids)."
---

# The `scratch/` write exemption does not cover `lifecycleStatus: restart-required`, so a session stuck there cannot even persist its own report

## What happened

`pipeline-start`'s own documented claim is that `scratch/` is always a safe
place to write a throwaway note, regardless of lifecycle state
(`guardrails/global.md` / `templates/prompts/agent-obligations.md` §3: "the
right place for a probe or a throwaway fixture"). During the 2026-08-29
three-runner greenfield test, a session sitting at the `restart-required`
lifecycle status hit this false: it could not write anything under
`scratch/`, and consequently could not persist its own audit report at all —
Codex ended up delivering its report inline in chat instead, which is exactly
the "exists only in chat, not as a persisted artifact" failure mode
`docs/operating-model.md` (P2) and GL-07 exist to forbid.

## Where it is

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`. There is already a
precedent fix for the identical shape of problem at a *different* lifecycle
status, and its own comment names the gap left open for `restart-required`
explicitly:

- `INTAKE_LIFECYCLE_STATUSES` (line 229) — `new Set(["intake-required",
  "intake-design-questions-required"])` — is the set of statuses for which a
  scratch write is admitted, added by `NVA-GF-SCRATCH` (backlog:
  `2026-08-28-a-scratch-write-is-refused-during-intake-against-the-
  documented-exemption.md`).
- The admission itself (lines 3678–3691) checks
  `INTAKE_LIFECYCLE_STATUSES.has(error.lifecycleStatus)` before allowing
  `isIntakeLifecycleScratchWrite()` / `isIntakeLifecycleScratchMkdir()`
  through — narrowly scoped to those two statuses "only -- every other
  PORG-NOT-READY status is unaffected and keeps refusing both operations
  exactly as before" (comment at line 3683).
- The `restart-required` branch (lines 3632–3639) admits exactly ONE thing:
  a write to the single fixed resume-hint input path
  (`isRestartResumeHintInputWrite()`) or its matching Bash capture command
  (`isRestartResumeHintCapture()`). Nothing else — including a generic
  `scratch/` write — is admitted while `lifecycleStatus === "restart-
  required"`; the comment at lines 3667–3669 for the sibling `partial`-status
  admission says so explicitly ("every other PORG-NOT-READY status
  (restart-required among them) is unaffected").

So this is not a guess about where the mechanism lives: the code already
distinguishes "generic scratch write" from "the one narrow resume-hint
write" for this exact status, and only ships the narrow one.

## Proposal

Add a `restartLifecycleScratchWrite` admission mirroring
`intakeLifecycleScratchWrite`, scoped to `error.lifecycleStatus ===
"restart-required"`, admitting `Write`/`Edit` targets under `scratch/` and
the matching `mkdir -p scratch/...` Bash form — reusing
`isIntakeLifecycleScratchWrite()` / `isIntakeLifecycleScratchMkdir()` (or a
renamed, status-parameterized version of them, since the underlying
predicate — "is this write inside `scratch/`" — does not need to differ
between the two statuses) rather than duplicating the path logic. Keep the
existing single-purpose resume-hint-input admission unchanged; this is
additive, not a replacement.

## Acceptance

- A session observed at `lifecycleStatus: restart-required` can write a new
  file under `scratch/` and can `mkdir -p` a nested `scratch/` directory,
  verified by a test.
- The existing narrow resume-hint-input admission (`isRestartResumeHintInputWrite`)
  and its near-miss diagnostic (`restartResumeHintNearMissWrite`) are
  unchanged and still pass their existing tests.
- A write outside `scratch/` (e.g. directly to `docs/state.md`) while
  `restart-required` is still refused — proven by a test, since this is the
  case that would silently widen the admission past its intended scope.
- The guard's full existing test suite for `guard-lifecycle-ready.mjs`
  passes unchanged aside from the new coverage.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment:** `sprint: nova`, and it blocks the 0.6.0 release candidate — a
  session stuck at `restart-required` cannot persist even a diagnostic note
  about its own stuck state, which is a happy-path continuity blocker, not a
  cosmetic gap.
- **Date:**
