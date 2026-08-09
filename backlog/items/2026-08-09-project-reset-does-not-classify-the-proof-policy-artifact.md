---
schema: pipeline.backlog-item.v1
id: pipeline.project-reset-does-not-classify-the-proof-policy-artifact
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Critic review (round 2, PASS) of GF-062/GF-065's critical-human-proof.json onboarding fix, scratch/critic-1f03ce024c82/critic-notes.md, deliberately not flagged as a finding of that diff."
---

# `project-reset.mjs` does not classify `project/critical-human-proof.json`, so a reset leaves it behind

## What happened

`plugins/pipeline-core/scripts/project-reset.mjs` (around lines 319-334)
derives its removal set from `AUTHORITY_KINDS` (calibration + manifest),
handover, private state, kickoff anchors, and runtime-projection targets.
The newly seeded `project/critical-human-proof.json`
(`2026-08-09-critical-human-proof-not-materialized-for-signature-mode.md`,
closed) is in none of these classes, so `project-reset` leaves it behind.

The reviewing Critic examined this and did not report it as a defect of
that diff: `project/push-threat-model.md` is equally unclassified (a
pre-existing gap, not introduced by this fix), the leftover direction is
fail-closed (a stale proof policy can only make a later `approve-push`
MORE restrictive, never less), and no guardrail in that review's supplied
set anchors the omission. It is filed here as its own item because it is a
real, reproducible gap in `project-reset.mjs`'s classification — not
merely a hypothetical.

## Direction

Add `project/critical-human-proof.json` (and, while auditing this, likely
`project/push-threat-model.md` too) to `project-reset.mjs`'s classified
removal set, or to whichever category is the correct fit among
`AUTHORITY_KINDS`/kickoff anchors/runtime-projection targets. Needs a test
asserting a reset actually removes both files, not just the ones currently
classified.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
