---
schema: pipeline.backlog-item.v1
id: pipeline.commit-bound-signature-refuses-pipeline-source-paths
type: defect
owner: pipeline
status: open
created: 2026-10-17
source: "Sprint Alfred Claude continuation 2026-10-17, Route A attempt for protected patches; PO decision 2026-10-17 (fix after 0.7.0)."
sprint: alfred
done_when: manual
---

# Commit-bound signature approval refuses every protected path under plugins/pipeline-core

## Description

AC-258 promises one agent-prepared, single-line signing command per approval.
For protected paths under `plugins/pipeline-core/` the commit-bound override
route never works: the eligibility check requires an author root for Pipeline
source paths (`HGO-AUTHOR-ROOT-REQUIRED`), and the pre-commit hook never
passes one. The commit is refused as `PB-COMMIT-OVERRIDE-NONOVERRIDABLE`, and
the real cause is swallowed, so the refusal does not say why.

The working alternative is the signed quality package (patch, `build-qp.mjs`,
`po-human-approval.mjs sign-intent`, materializer). It is more ceremony than
AC-258 intends. Hosted projects are not affected: their protected paths are not
Pipeline source paths.

## Proposal

Either supply the author root from the pre-commit hook for Pipeline source
paths, or refuse the route up front with the real cause and name the quality
package as the alternative. Either way, surface `HGO-AUTHOR-ROOT-REQUIRED`
instead of swallowing it.

## Acceptance

- A commit-bound override for a protected Pipeline source path either succeeds
  with one signing command, or is refused before the PO signs, naming the cause
  and the alternative.
- A pin covers both the eligibility outcome and the surfaced cause.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** PO 2026-10-17: backlog, fix after 0.7.0.
- **Rationale:** The quality package works; only Pipeline self-development is affected.
- **Assignment (if accepted):**
- **Date:** 2026-10-17
