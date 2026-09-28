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
with 401. A diagnostic link to the existing local auth file, removed
after a normal turn, allowed the review but is unsafe: a killed child can leave
the link in registered scratch and the review environment can read through it.
It must not be promoted to production. Even then the default production host
composition omitted its `take` callback, so a successful child ended with
`readiness host has no exact report readback`.

## Affected artifact

`codex-readiness-app-server-child.mjs`, `codex-readiness-app-server.mjs`,
`codex-design-readiness-host.mjs`, `spec-readiness-host.mjs`, and their focused tests. The failure taxonomy in
the selected readonly bridge should preserve a terminal child result instead
of describing every non-reviewed result as lost stdio.

## Proposal

Treat an `unknown` command action as inconclusive telemetry, but continue to
reject explicit mutating action types as well as file-change and server-RPC
events. Keep the selected filesystem sandbox and `approvalPolicy: never`. Use a
Codex-compatible, fully typed `outputSchema` bound to dispatch, candidate and
the five source hashes; validate the returned report again against the
canonical receipt schema. Set finite, coordinated child/host deadlines for the
real comparison and return a typed failure when the child exits cleanly with
an invalid report or terminal turn failure.
Provide an authenticated host-boundary route that keeps the credential source
outside model-readable scratch, including on crash and restart. The receipt
must truthfully name the isolation mechanism actually used. Never copy or
persist secret bytes in a public receipt or bypass a denied host/export
decision. Connect the selected
bridge's exact `take` callback to the runtime transport on the default path.

## Acceptance

- A live selected Codex/WSL run publishes a schema-valid, exact-candidate
  readiness receipt or a typed unavailable result; it does not fabricate a
  successful review when a child fails.
- A command event with `commandActions: ["unknown"]` does not alone abort a
  read-only review. An explicit mutating command action, file change, or
  unexpected App Server request still fails.
- A five-source review has a bounded time budget long enough for the current
  configured model, with host deadline exceeding child deadline.
- The structured output schema is accepted by Codex and the host independently
  validates all returned fields and digests.
- A failed turn, invalid schema, timeout and lost stdio remain distinguishable
  in sanitized diagnostics without retaining raw prompts or reports in the
  public failure receipt.
- The selected route completes an authenticated turn while the review cannot
  read a credential reference, including after SIGKILL. Registered scratch
  remains recoverable and the exact bound report reaches the runtime `take`
  path.
- The host disables inherited plugins, MCP servers, hooks, command tools,
  external tools and environment access before accepting untrusted evidence.
  Tool inventory queries are thread-bound; a global MCP inventory query must
  not accidentally start a configured server. Process ownership, finite
  shutdown and restart recovery are registered before a productive spawn.

## Triage

Reproduced locally. A scratch-only child with the proposed schema and time
budget completed two real Codex turns with valid bound reports, including a
full comparison. A later selected-sandbox diagnostic with a temporary auth
link and corrected `take` callback published a candidate-bound probe receipt
under `scratch/` (`design-readiness-selected-probe-20260928i.json`). An
independent patch critique found the link's credential exposure and crash
cleanup flaw plus loss of explicit mutation detection. This probe is a
diagnostic only. The regenerated `scratch/codex-readiness-fix.patch` has no
auth link and restores explicit mutation detection, but remains incomplete
because its fresh scratch home is unauthenticated.

A later Codex-only host prototype completed an authenticated synthetic turn
with the registered readiness model/effort, a named restricted-read profile,
all model tools disabled, and no secret copying or linking. Its adversarial
input caused no tool/server request or fixture mutation. A model-free control
also verified readable input, denied outside input and denied writes. A
configured synthetic MCP server remained disabled without starting when the
inventory was queried with the exact thread ID. These are scratch diagnostics,
not a production transport, design gate or candidate stamp. The production
source path remains unverified until a safe fix is integrated and replayed
without dependency substitution.

Process-supervisor preparation subsequently completed an authenticated Codex
synthetic turn on source `200014e9`, with closed ownership digests and zero
remaining owned session members (`scratch/codex-managed-isolated-host-smoke.json`).
The Linux prototype durably binds a worker PID/starttime before replacing its
image with Codex, using feature-probed `process.execve`. No model input is
accepted before post-exec identity readback. Nine focused supervisor fixtures
cover failed child, live-controller refusal, killed launcher, actual orphan
recovery with missing post-exec observation, malformed stat, PID-identity drift,
unsafe journal links and intent without spawn. Terminal observation is bounded;
interrupted or unverifiable ownership never yields a successful review.

This remains scratch evidence. The production private store, bootstrap
composition and architecture adoption are not integrated, and the feature
remains open. `scratch/draft-codex-tool-free-readiness-host.md` proposes the
explicit readiness-only architecture boundary. The compiled estate reports
ADR-0039 as proposed; ADR-0041 remains accepted for the separate Advisor route.

The next preparation batch on `e925be24` completed an authenticated native
Codex review over five committed synthetic sources. The full canonical report
returned `ready-for-po-review`; its private receipt was independently verified
by reconstructing the exact request from source bytes and reading the actual
closed process journal. No coordinator-supplied expectations substitute for
that reconstruction. This is recorded in
`scratch/codex-tool-free-five-source-store-smoke.json`, not an approval of the
product design or a production execution stamp.

Six scratch private-store fixtures and seven five-source composition fixtures
pass, including forged ownership, weak assurance, immutable-read drift,
uncommitted source bytes, ready-with-blocker rejection and tool-attempt failure.
Seven exact proposed regular-host-function fixtures additionally cover export
denial before startup, repository/route mismatch, source drift, failed private
readback, candidate drift, preserving not-ready and retaining recovery input.
The earlier 66 component tests remain bound to unchanged file hashes; the
seven host tests are incremental verification.

`scratch/codex-tool-free-readiness-source.patch` now prepares the Codex-only
library and regular host/bootstrap connection, a separate private namespace,
truthful host-observed tool-free assurance, typed bootstrap diagnostics,
canonical tests, Verify registration and kernel/threat-model dependencies.
The regular host chooses that class explicitly; it does not silently retry
between isolation classes after a denial or failed execution. Static prepared
kernel-edge checking identified and included the transitive tool-identity
reader. Syntax/import checks and dry application pass; the incremental record
is `scratch/codex-readiness-activation-evidence.json`.

No canonical implementation was changed in this preparation batch. Architecture
adoption, protected source integration, official kernel-closure and canonical
tests, the real committed product-package readiness and final candidate gates
remain required. The backlog item remains open.
