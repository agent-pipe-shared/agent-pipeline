---
schema: pipeline.backlog-item.v1
id: pipeline.two-minor-happy-path-retries-in-the-final-codex-run
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-09
sprint: nightwing
source: "Independent read-only analysis of the PO's private Codex+Pipeline 0.5.4 happy-path re-test (fifth local candidate, final successful session), 2026-08-09."
due: 2026-08-16
done_when: manual
---

# Two proactive checks would have removed the only two retries in an otherwise clean run

## What happened

Two distinct, single-retry friction points, each costing one wasted call plus
a short diagnostic detour, in a session that was otherwise clean start to
finish:

1. **Kickoff-promotion feature ID starting with the reserved prefix.**
   `project-onboarding-v3.mjs kickoff promote plan ... --id kickoff-<uuid>`
   refused with `KICKOFF-PROMOTION-INPUT: promotion feature id is invalid`.
   The agent read `onboarding-continuity.mjs`'s source, found that a feature
   ID starting with `kickoff-` is explicitly rejected (it collides with the
   provisional-anchor naming convention), and retried with a plain slug —
   succeeded immediately. Nothing tells an agent this prefix is reserved
   before it tries an ID shaped like the ones the tool itself uses elsewhere
   (`kickoff-<hex>` provisional directories).
2. **Guard-lifecycle staleness surfacing only after a commit, right before a
   GitHub step.** A batched read-only check (`git remote -v` / `gh --version`
   / `gh auth status` / an SSH key listing) was denied as a whole with
   `GUARD-LIFECYCLE-NOT-READY: Pipeline session readiness is
   session-capability-unavailable`, naming the fix
   (`project-onboarding-v3.mjs inspect --intent session`). The agent ran it,
   got `"status":"ready"`, and the same batch succeeded on retry ~30s later.
   The session's capability had gone stale since an earlier checkpoint and
   nothing re-validated it proactively before the first external
   (GitHub-facing) command of that kind.

## Why it matters

Both are correctly fail-closed and both recovered in exactly one step — this
is the guard system working as designed, not a defect. But both are also
entirely predictable in advance: the reserved-prefix rule is static, and the
staleness-after-commit pattern is a known shape (a commit is exactly the kind
of event that can invalidate session capability). Removing both would make an
already-clean run cleaner still, at effectively zero cost since the checks
already exist — they would just move from reactive (agent hits the wall, then
recovers) to proactive (never hits the wall).

## Direction

1. Either reject a caller-chosen feature ID starting with `kickoff-` earlier
   (at ID-suggestion time, not just at promotion-validation time), or state
   the reserved-prefix rule directly in whatever step first suggests or asks
   for the feature ID.
2. Schedule the `inspect --intent session` capability re-check automatically
   right before the first GitHub-facing command after a commit, rather than
   waiting for `GUARD-LIFECYCLE-NOT-READY` to surface it reactively.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — owned by Sprint Nightwing ("Product experience:
  onboarding, configuration, documentation and low-friction adoption" —
  ADR-0043's 2026-08-17 amendment). Both findings are proactive-check
  additions to an already-correct, already fail-closed happy path — exactly
  Nightwing's low-friction-adoption scope, not an architecture or security
  gap.
- **Rationale:** cheap, well-specified, but genuinely non-urgent — a
  one-retry cost in an otherwise clean run, not blocking anything current.
- **Assignment (if accepted):** next available Nightwing slot, unassigned.
- **Date:** 2026-08-17
