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

## Triage

- **Decision:** accepted as a design item; it depends on the evidence-promotion
  design because both change the push driver boundary.
- **Assignment (if accepted):** Nova B release-governance optimisation.
- **Date:** 2026-09-17
