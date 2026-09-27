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
The selected sandbox adds two more failures: the nested App Server attempts to
write under the read-only user Codex home and exits before `initialize`; a
fresh writable home starts but lacks authentication and the model turn fails
with 401. A diagnostic read-only link to the existing local auth file, removed
after the turn, allowed the review. Even then the default production host
composition omitted its `take` callback, so a successful child ended with
`readiness host has no exact report readback`.

## Affected artifact

`codex-readiness-app-server-child.mjs`, `codex-readiness-app-server.mjs`,
`codex-design-readiness-host.mjs`, `spec-readiness-host.mjs`, and their focused tests. The failure taxonomy in
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
Provide the nested App Server a scratch-contained writable home and an
explicit, temporary, read-only credential reference that the host can verify
and remove before scratch resealing. Never copy or persist secret bytes in a
public receipt or bypass a denied host/export decision. Connect the selected
bridge's exact `take` callback to the runtime transport on the default path.

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
- The selected sandbox starts the App Server, completes an authenticated turn,
  removes any temporary credential reference before resealing, and returns the
  exact bound report through the default runtime `take` path.

## Triage

Reproduced locally. A scratch-only child with the proposed schema and time
budget completed two real Codex turns with valid bound reports, including a
full comparison. A later selected-sandbox diagnostic with a temporary auth
link and corrected `take` callback published a candidate-bound probe receipt
under `scratch/` (`design-readiness-selected-probe-20260928i.json`). The
production source path remains unverified until the fix is integrated and
replayed without dependency substitution.
