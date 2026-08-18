---
schema: pipeline.backlog-item.v1
id: pipeline.cli-docs-generated-from-parser
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P2-3 (priority P2)"
---

# Generate CLI usage docs from parser definitions and cover them with contract tests

## Description

The --dir documentation and the flagless CLI drifted apart from each
other over time, meaning documented usage no longer matched actual
command behavior.

## Triggering situation

From a greenfield happy-path test report, pipeline version
0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52,
full report at docs/pipeline-greenfield-happy-path-handover.md in that
test repo. Cites Section 9, item P2-3 ("Dokumentation und CLI aus einer
Quelle").

## Affected artifact

CLI usage documentation generation, push/recovery command docs.

## Proposal

Usage examples should be generated from the CLI parser definitions or
from tested fixtures, and every command form shown in the docs should run
in a contract test.

Acceptance test: all documented push and recovery commands are validated
in CI as argv fixtures against the real parser.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
