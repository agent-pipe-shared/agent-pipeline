---
schema: pipeline.backlog-item.v1
id: pipeline.critical-command-kinds-excludes-feature-package-reconcile
type: defect
owner: pipeline
status: open
created: 2026-08-16
source: "Found 2026-08-16 while building the PO's feature-package-reconcile signing request for the Phoenix P-AC-11/FTP-ARTIFACT-2 ceremony -- the PO had to manually cp a request file the Elephant built out to the external signing directory, and asked why."
due: 2026-09-15
---

# `po-human-approval.mjs`'s `CRITICAL_COMMAND_KINDS` excludes `feature-package-reconcile`, forcing a manual copy step that `prepare-critical` should make unnecessary

## Description

`plugins/pipeline-core/scripts/po-human-approval.mjs:105` freezes
`CRITICAL_COMMAND_KINDS` to exactly `["push", "deploy", "publication"]`.
`parseHumanArgs`'s line 133 (`if (command.endsWith("-critical") &&
!CRITICAL_COMMAND_KINDS.includes(values.kind)) return { error: USAGE };`) then
refuses `prepare-critical --kind feature-package-reconcile` outright, even though
`feature-package-reconcile` has been a first-class `CRITICAL_ACTION_KINDS` member
since `c6bd3a6b` (P-AC-08) and is in `pipeline-state.mjs`'s
`ALWAYS_REQUIRED_KINDS`.

`prepare-critical`'s whole purpose is to write a public, digest-bound request file
directly INSIDE the external `--directory` (`paths.request =
artifactPath(directory, "request-critical-${kind}.json")`), so the human never
has to relocate anything before signing. Because reconcile isn't in the accepted
set, the Elephant instead had to build the equivalent request with
`createCriticalActionApprovalRequest` in a throwaway `scratch/` script (per
`docs/push-release-flow.md`'s own sanctioned pattern for computing
`--subject-sha256`) — but that script can only write inside the repo (agent
writes outside the project root are refused by `GUARD-CROSS-REPO-MUTATION`), so
the PO had to manually `cp` the file out to the external directory before
`--proof-request` could reference it (`externalPublicJson`/`externalJson` both
refuse a path inside the repo root).

This confirmed, live, 2026-08-16: `prepare-critical --repo-root ... --directory
~/agent-pipeline-po-nova --feature-id sprint-phoenix-epic --plan ... --spec ...
--kind feature-package-reconcile --subject-sha256 ... --expires-at ...` refused
with the bare USAGE string, before ever reaching the candidate/subject logic.

## Affected artifact

`plugins/pipeline-core/scripts/po-human-approval.mjs:105` (`CRITICAL_COMMAND_KINDS`).

## Proposal

Add `"feature-package-reconcile"` to `CRITICAL_COMMAND_KINDS`. Verify
`prepare-critical`/`approve-critical`/`verify-critical` all work end-to-end for
this kind exactly as they do for `push`/`deploy`/`publication` — in particular
that `createCriticalActionApprovalRequest`'s `action.kind` validation
(`CRITICAL_ACTION_KINDS`, already includes it) and the `feature-package-reconcile`
consumption path in `pipeline-state.mjs` (`verifyCriticalHumanProof`'s generic
subject-shape check) accept a request built this way with no format drift from
what `defaultFeaturePackageReconcileApproval`'s own `subject: {manifest,
planSha256, candidate}` shape expects. This is a same-class instance of the
ADR-0061 version-skew pattern already tracked in
`backlog/items/2026-08-07-push-release-flow-unusable-for-third-party-adopters.md`
— a critical-action kind that exists in the data model but not in every CLI
surface that should recognize it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
