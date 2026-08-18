---
schema: pipeline.backlog-item.v1
id: pipeline.canonical-verify-evidence-path
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P0-5 (priority P0)"
---

# Unify verify evidence path between producer and push guard

## Description

The verify evidence producer and the guard consumer used different file
paths (verify.json vs. verify-latest.json) for the same evidence
artifact. This mismatch means a default verify run does not necessarily
produce the file the push guard actually reads, creating a silent gap
between evidence generation and evidence consumption.

## Triggering situation

Observed during a greenfield happy-path test of pipeline version
0.6.0+codex.20260818162535.96cf805 in test repo Rune_Test1_Codex_060_52,
documented in docs/pipeline-greenfield-happy-path-handover.md (in that
test repo), Section 9, item P0-5.

## Affected artifact

verify.mjs (evidence producer), guard-push.mjs, critic-packet-preflight.mjs,
documentation.

## Proposal

Introduce a shared export, VERIFY_EVIDENCE_DEFAULT_PATH, imported by the
producer, the push guard, the Critic preflight, and the documentation, so
all four consistently reference the same evidence path. The producer
should use this path by default; free/custom paths should only be
permitted for additional (supplementary) evidence, not as a substitute
for the default.

Acceptance test: invoking verify with no flag, using the default
settings, must produce exactly the file that the push guard consumes.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
