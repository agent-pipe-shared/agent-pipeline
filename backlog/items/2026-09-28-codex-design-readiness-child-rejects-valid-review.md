---
schema: pipeline.backlog-item.v1
id: pipeline.codex-design-readiness-child-rejects-valid-review
type: defect
owner: pipeline
status: open
created: 2026-09-28
source: "Local Codex 0.157.1 design-readiness replay on 2026-09-27/28; scratch/codex-readiness-provisional-report.json and scratch/codex-readiness-fix.patch."
sprint: alfred
done_when: manual
---

# Codex design-readiness host discards the independent review

## Description

The selected Codex readiness child launches an actual App Server turn, but
classifies `commandExecution.commandActions: ["unknown"]` as a write attempt.
Current Codex uses this descriptive value during ordinary repository reads.
The host then records an ambiguous lost-stdio execution and the bootstrap
reports only that the review is not execution-bound. Once this false positive
is removed, the 180-second child limit can terminate a normal five-source
review. The unconstrained model answer can also fail the closed receipt schema.
Passing the canonical schema directly as `turn/start.outputSchema` fails with
`invalid_json_schema` because its `const` field has no explicit `type`.

## Affected artifact

`codex-readiness-app-server-child.mjs`, `codex-readiness-app-server.mjs`,
`spec-readiness-host.mjs`, and their focused tests. The failure taxonomy in
the selected readonly bridge should preserve a terminal child result instead
of describing every non-reviewed result as lost stdio.

## Proposal

Treat `commandActions` as telemetry while keeping the selected filesystem
sandbox, `approvalPolicy: never`, file-change and server-RPC checks. Use a
Codex-compatible, fully typed `outputSchema` bound to dispatch, candidate and
the five source hashes; validate the returned report again against the
canonical receipt schema. Set finite, coordinated child/host deadlines for the
real comparison and return a typed failure when the child exits cleanly with
an invalid report or terminal turn failure.

## Acceptance

- A live selected Codex/WSL run publishes a schema-valid, exact-candidate
  readiness receipt or a typed unavailable result; it does not fabricate a
  successful review when a child fails.
- A command event with `commandActions: ["unknown"]` does not alone abort a
  read-only review. A file change or unexpected App Server request still fails.
- A five-source review has a bounded time budget long enough for the current
  configured model, with host deadline exceeding child deadline.
- The structured output schema is accepted by Codex and the host independently
  validates all returned fields and digests.
- A failed turn, invalid schema, timeout and lost stdio remain distinguishable
  in sanitized diagnostics without retaining raw prompts or reports in the
  public failure receipt.

## Triage

Reproduced locally. A scratch-only child with the proposed schema and time
budget completed two real Codex turns with valid bound reports, including a
full comparison. The production selected-sandbox path remains unverified until
the source fix is integrated and the host replay runs.
