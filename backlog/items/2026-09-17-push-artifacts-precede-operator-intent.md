---
schema: pipeline.backlog-item.v1
id: pipeline.push-artifacts-precede-operator-intent
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-17
source: "evidence/codex-pipeline-session-analysis.md and evidence/pipeline-analysis-claude-session.md, independently compared with the 0.6.2 push-init experience on 2026-09-17."
sprint: nova-b
done_when: manual
---

# Push preparation materializes signature-adjacent artifacts before a clear operator intent

## Description

The Greenfield reports observed that the delivery path can create
signature-adjacent request/proof material while an operator is still deciding
whether a push should happen.  The 0.6.2 session also showed that a late
precondition can invalidate that work and force another ceremony.  The
external-key signature itself remains the correct human gate; the problem is
the timing and clarity of the automated preparation around it.

## Triggering situation

The Codex report requested an explicit `stopped-by-po` terminal status and
late creation of push artifacts.  Claude independently reported sequential
preconditions and unnecessary repeated signing.  Existing `push-init` already
collects several checks, but it does not yet distinguish a non-mutating
readiness preview from an operator-intended authorization attempt.

## Affected artifact

`plugins/pipeline-core/scripts/push-init.mjs`,
`plugins/pipeline-core/scripts/push-prepare.mjs`, the PO approval scripts, and
the lifecycle/result schema.

## Proposal

Split delivery into a read-only readiness preview and an explicit
operator-intent transition.  The preview aggregates every satisfiability
failure and creates no signature-adjacent artifact.  Only an explicit intent
may bind a candidate and prepare the one external-key stop; declining or
expiring it records a typed, non-error `stopped-by-po` result that can be
resumed safely.

## Prepared decision sketch — not an implementation authorization

### Two commands with disjoint authority

`push readiness` is read-only.  It resolves the immutable candidate, runs the
same preflight/receipt/policy checks the action would use, and returns one
versioned preview.  It may write only an ephemeral caller-owned display
artifact, never a request, proof, authority, capability, pending-push record
or signature digest.  Its result contains all failed predicates together,
the exact receipts that would be reused, and a digest of the checked inputs.

`push intent` is the only command that may create a candidate-bound pending
action.  It receives the preview digest and recomputes the preview's
authoritative bindings before writing anything; a changed HEAD, tree, policy,
receipt, environment classification or remote-readback state invalidates the
preview rather than silently refreshing it.  Its output names one explicit
external-key signature action and its expiry.  It does not push.

The later consume/apply step accepts only that unexpired, exact intent and
must read back the remote result before declaring delivery.  The signature is
therefore still the human boundary, but it is no longer spent while the
pipeline is discovering routine preconditions.

### Terminal result vocabulary

The result schema should distinguish ordinary non-delivery outcomes from
errors:

- `ready-for-intent` — preview succeeded; no durable action artifact exists.
- `stopped-by-po` — the operator declined before or after preview; no push
  occurred and any pending artifact is explicitly invalidated.
- `expired` — a candidate-bound intent aged out without consumption; no push
  occurred.
- `superseded` — candidate or binding changed; a fresh preview is required.
- `pushed` / `remote-readback-failed` — the only states after an attempted
  external effect, each carrying the candidate and remote readback binding.

`stopped-by-po`, `expired`, and `superseded` are successful lifecycle
outcomes, not failures to be retried by a different shell lane.  They must be
idempotent and contain no secret or signature payload.

### Minimum adversarial matrix

Pin: a preview that leaves no durable push artifact; an intent with a stale
preview; a source/tree mutation after preview; a changed receipt or policy;
PO decline before signing; expiry after signing but before consume; repeated
consume; and a remote failure after a successful signature.  Every case must
prove that no extra signature is requested merely to learn a local
precondition, and that no external push occurs for any non-delivery status.

## Triage

- **Decision:** accepted as a design item; it depends on the evidence-promotion
  design because both change the push driver boundary.
- **Assignment (if accepted):** Nova B release-governance optimisation.
- **Date:** 2026-09-17
