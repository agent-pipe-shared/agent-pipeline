---
schema: pipeline.backlog-item.v1
id: pipeline.compaction-stable-bootstrap-lease
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P1-3 (priority P1)"
---

# Compaction-stable bootstrap lease to prevent redundant full re-bootstrap

## Description

A compaction event in the same root thread triggered a full re-bootstrap,
even though the repository, runtime, and authority digests had not
changed. There is currently no machine-readable lease that lets
compaction skip a redundant full re-check.

## Triggering situation

From a greenfield happy-path test report for pipeline version
0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52,
full report at docs/pipeline-greenfield-happy-path-handover.md in that
test repo. Section 9, item P1-3.

## Affected artifact

compact/post-compact-reground hook; pipeline-start-preflight.mjs.

## Proposal

Implement a session lease produced by ready-readback that carries a
repository fingerprint, runtime readback, authority digests, and an
expiration condition; have compaction consume this lease in
machine-readable form, invalidating it only on repository change, runtime
change, drift, or explicit recovery.

Acceptance test: after a compaction event, pipeline-start-preflight is
not re-run as long as the lease and digests remain unchanged.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
