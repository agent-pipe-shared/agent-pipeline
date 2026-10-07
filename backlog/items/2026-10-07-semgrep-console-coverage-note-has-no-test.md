---
schema: pipeline.backlog-item.v1
id: pipeline.semgrep-console-coverage-note-has-no-test
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "Critic finding F-1 (minor, QG-06), SEM delta review 2026-10-07, specs/sprint-alfred-epic/evidence/critic-2026-10-07/sem-delta.md"
sprint: alfred
done_when: manual
due: 2026-10-20
---

# The semgrep console coverage note has no test

## Description

A semgrep run with warn-level PartialParsing errors prints a coverage note on the scanner's console summary line
(`plugins/pipeline-core/scripts/security-scan.mjs`, `coverageSuffix`: "coverage: degraded (N files partially parsed)").
The PO decision for semgrep partial parsing asks for exactly this visible note, but no test pins it: the test header in
`security-scan.test.mjs` (~line 1762) records it as waived because no production seam was found. A regression of the
human-visible note would pass the suite.

## Triggering situation

SEM delta Critic review, 2026-10-07, finding F-1 (QG-06: a known gap without owner and due date is a finding).

## Affected artifact

`plugins/pipeline-core/scripts/security-scan.mjs` (`printSummary` / `coverageSuffix`), `plugins/pipeline-core/scripts/security-scan.test.mjs`.

## Proposal

Test-only dispatch first: drive the CLI path (the suite already captures CLI per-scanner lines) with a fake semgrep
binary emitting a warn-level PartialParsing entry and assert the suffix; if no seam exists, the fix dispatch exports a
pure formatter and the test pins it. Owner: pipeline; due before the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
