---
type: workflow-improvement
status: accepted
created: 2026-07-20
source: PO-approved parallel Sentinel work and Critic scope correction
owner: Pipeline Elephant
due: 2026-07-20
---

# Establish canonical observation intake and document governance

## Description

Unverified behavior reports need a branch-independent GitHub Issue before they
are promoted into a stable-branch backlog item. Public documentation also needs
an explicit audience and lifecycle classification so user guidance, maintainer
material, machine inventories, normative records, compatibility redirects, and
review candidates are not mixed implicitly.

This is an independently accepted companion package delivered in parallel with
SNT-A. It is governed by
[ADR-0042](../../docs/adr/0042-global-observation-and-document-governance.md),
not by the private-overlay activation contract. The shared delivery commit may
contain both packages, but each package retains its own acceptance criteria and
review evidence.

## Acceptance criteria

- GitHub Issues are the canonical Public single source for unverified
  observations. Capture assigns exactly `kind:observation` and
  `triage:needs-review`; capture never promotes an observation to Known Error or
  a backlog item.
- The repository provides a closed Issue Form and a `capture-observation` skill
  with duplicate search, privacy/security routing, exact preview and human
  confirmation, creation, and target readback.
- Every rendered GitHub repository reference is bound to the resolved Public
  target repository. Cross-repository or private coordinates fail closed and
  are not copied into a public Issue.
- The data-privacy review covers every free-text field, repository-reference
  handling, redaction boundary, GitHub storage target, and the private security
  route. Delivery remains blocked until an independent reviewer records an
  explicit PASS against this item and the exact correction diff.
- A machine-readable inventory classifies every file below `docs/` on separate
  audience and lifecycle axes. Bootstrap, Close, and Verify enforce inventory
  completeness without moving or deleting review-candidate documents.
- The product capability inventory assigns every newly discovered skill and
  Verify surface to exactly one capability.

## Consumer and backward-compatibility assessment

The observation Issue Form and skill are new Public interfaces. Existing issue
numbers, ordinary GitHub Issue URLs, and repository content links are
unchanged. The removed `.github/ISSUE_TEMPLATE/bug_report.md` was a legacy
capture path with no V3 schema, labels, privacy routing, duplicate search, or
readback contract. Direct `?template=bug_report.md` bookmarks therefore stop
prefilling that legacy body; this is an intentional chooser-level breaking
change so reports cannot silently bypass the canonical intake. The replacement
is the `observation.yml` form exposed by the repository Issue chooser. No
runtime API, committed issue data, backlog item, or existing Issue is migrated
or deleted.

## Rollback and recovery

Before GitHub publication, revert the companion implementation commit and
restore the legacy template if the privacy review, focused tests, governance
checker, or exact-candidate Verify is red. After publication, preserve created
Issue URLs as the canonical records; disable further form/skill capture by a
normal revert, then correct and republish the form. Never delete or copy Issues
to simulate rollback. Document classification changes use reviewed ordinary
commits; they do not relocate or delete files until link and authority review
is complete.

## Review and result

- Data-privacy review: pending independent exact-diff review.
- Focused tests: pending correction candidate.
- Exact-candidate Verify: pending final delivery candidate.
- Independent Critic: initial combined review failed; follow-up is restricted
  to the correction delta for this contract.

## Triage

- **Decision:** Accepted by the PO as parallel work in the current Sentinel
  block.
- **Rationale:** This is a specified implementation request, not an unverified
  behavior observation; a backlog contract is therefore appropriate under
  ADR-0042.
- **Assignment:** Pipeline Elephant with bounded Goldfish corrections and
  independent privacy/Critic review.
- **Date:** 2026-07-20
