---
schema: pipeline.backlog-item.v1
id: pipeline.adr-0045-topology-divergence-from-package-and-skill
type: defect
owner: pipeline
status: closed
created: 2026-08-09
source: "First real run of harness/scripts/check-doc-reconciliation.mjs over the commit range 8dcb1cc..dec2ed4 implicated docs/adr/0045-canonical-artifact-topology.md (Governs: specs/**) because paths under specs/ changed in that range. Reading the ADR against the actual specs/sprint-phoenix-epic/ package it governs then showed two distinct divergences between the decision record and the shipped implementation."
due: 2026-09-08
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "0252cb01f354d29b1262467d649788505f1e7245"
closure_evidence: "backlog/items/2026-08-09-adr-0045-topology-divergence-from-package-and-skill.md"
---

# ADR-0045's canonical topology diverges from the package it governs, in two independent ways

## Description

ADR-0045 declares a durable rigor-1/2 feature package rooted at
`specs/<safe-feature-id>/` consisting of `prd.md`, `spec.md`, `acceptance.md`,
`result.md`, `lifecycle.json`, `plans/`, `design/`, and `evidence/`, and states
that "paths make package membership discoverable." Checking that decision
against the actual `specs/sprint-phoenix-epic/` package shows the enumeration
and the package have diverged in two independent ways, which is exactly what
`check-doc-reconciliation.mjs` exists to surface — not something this item
repairs.

## Triggering situation

`harness/scripts/check-doc-reconciliation.mjs`, run for the first time over a
real commit range (`8dcb1cc..dec2ed4`), implicated
`docs/adr/0045-canonical-artifact-topology.md` because paths under `specs/`
changed in that range. This is itself evidence that the check works as
designed on its first real invocation, and that ADR-0045's `Governs: specs/**`
line is scoped correctly — a change under `specs/` correctly triggered
reconciliation against exactly the ADR that governs that tree.

## Affected artifact

`docs/adr/0045-canonical-artifact-topology.md` (the decision), the package it
governs at `specs/sprint-phoenix-epic/` (the implementation), and
`plugins/pipeline-core/skills/pipeline-start/SKILL.md` (a second, contradicting
convention for one of the same filenames).

**Divergence 1 — four root artifacts the enumeration does not name.**
`specs/sprint-phoenix-epic/`'s root actually contains, beyond the enumerated
set: `RECOVERY.md`, `spec-revision-20260802.md`,
`phase-plan_gate-integrity.md`, `phase-residual_gate-integrity.md`. Either
ADR-0045's enumeration is incomplete, or these four sit outside the declared
topology. If package membership is meant to be discoverable from paths alone,
per the ADR's own claim, an unenumerated root artifact is exactly the failure
case that breaks that claim.

**Divergence 2 — the PRD filename disagrees three ways.** Verified at source,
quoted directly:

- ADR-0045 (`docs/adr/0045-canonical-artifact-topology.md:10`): "`prd.md`,
  `spec.md`, `acceptance.md`, `result.md`, `lifecycle.json`, `plans/`,
  `design/`, and `evidence/`" — names `prd.md`.
- The actual package on disk (`ls specs/sprint-phoenix-epic/`): the file is
  named `prd_phoenix-epic.md`, not `prd.md`.
- The shipped bootstrap skill
  (`plugins/pipeline-core/skills/pipeline-start/SKILL.md:145`): "Use
  `prd_short-topic.md`, `spec.md`, and `design-input.md`." — prescribes the
  `prd_<topic>.md` pattern, not `prd.md`.

The decision record (ADR-0045) and the shipped, currently-used convention (the
skill) contradict each other on this one filename, and the actual package
follows the skill's convention, not the ADR's.

## Proposal

Two PO-owned questions, not a repair, and not a general topology linter:

1. Is ADR-0045's package enumeration exhaustive (in which case the four
   unenumerated root artifacts in `specs/sprint-phoenix-epic/` are a topology
   violation to resolve) or illustrative (in which case the ADR's "paths make
   package membership discoverable" claim needs to be qualified)?
2. On the PRD filename, which of ADR-0045 (`prd.md`) or the bootstrap skill
   (`prd_short-topic.md`, which the shipped package actually follows) should
   move — does the ADR get amended to match the shipped convention, or does
   the skill get corrected to match the ADR?

Only if question 1 resolves toward "exhaustive": add a mechanical check that a
feature package root carries no unenumerated artifact, analogous in spirit to
`harness/scripts/check-artifact-topology.mjs` if that script does not already
cover this case.

Explicitly **not** proposed: a general-purpose topology linter across all
package shapes. This divergence was found by a check that reports a discrete,
scoped mismatch rather than guessing at a fix — `check-doc-reconciliation.mjs`
did exactly its job here, surfacing a contradiction for a human decision
instead of silently reconciling it. This repository's recent history (e.g.
`2026-08-09-adr-0047-renumber-left-live-references-behind.md`) contains
several findings where a plausible-looking automated repair, applied without
review, would have made things worse (rewriting historical records, breaking
hash-bound Spec authority). A general linter invites exactly that failure
mode at package-topology scale; a scoped, PO-decided fix does not.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Not decided — this entry records re-examination, not a
  choice. Both divergences the item names are still present verbatim:
  `docs/adr/0045-canonical-artifact-topology.md` still names `prd.md`, while
  `specs/sprint-phoenix-epic/` carries `prd_phoenix-epic.md` plus several
  unenumerated root artifacts (`RECOVERY.md`, `spec-revision-20260802.md`,
  `phase-plan_gate-integrity.md`, `phase-residual_gate-integrity.md`).
  Cross-checked against the sibling Nova checkout: the same pattern recurs
  there independently (`prd_sprint-nova-epic.md` plus `implementation/`,
  `plans/`, `release-lifecycle.json` outside ADR-0045's enumeration, against
  an unchanged ADR-0045 text) — confirming this is a real drift between the
  ADR and how every epic actually names/organizes its package, not a
  Phoenix-only glitch, and not something Nova has already resolved either.
- **Rationale:** The item explicitly frames its two questions (amend
  ADR-0045's naming convention, and whether/how to enumerate an epic's extra
  root artifacts) as PO-owned with no default answer proposed.
- **Assignment (if accepted):** Not assigned; needs the PO's answer before
  either ADR-0045 or the two checkouts' topology is changed.
- **Date:** 2026-08-18

## Triage — question 2 decided 2026-08-18, question 1 still open

- **PO decision on the naming question:** "prd_topic ist besser" — ADR-0045
  amended (not the skill) to name `prd_<topic>.md` instead of `prd.md`,
  matching the convention both `plugins/pipeline-core/skills/pipeline-start/SKILL.md`
  prescribes and every actual package (Phoenix's `prd_phoenix-epic.md`,
  Nova's `prd_sprint-nova-epic.md`) already uses. Done in
  `docs/adr/0045-canonical-artifact-topology.md` (header stamped
  `Amended: 2026-08-18`).
- **Question 1 clarified, not yet decided.** "Artefakt-Aufzählung" refers to
  ADR-0045's list of files a package root is declared to contain (`prd_<topic>.md`,
  `spec.md`, `acceptance.md`, `result.md`, `lifecycle.json`, `plans/`,
  `design/`, `evidence/`). The actual `specs/sprint-phoenix-epic/` root also
  carries four files that list never names: `RECOVERY.md`,
  `spec-revision-20260802.md`, `phase-plan_gate-integrity.md`,
  `phase-residual_gate-integrity.md`. The open question is whether that list
  is meant to be **exhaustive** (so those four extra files are a topology
  violation — either move them under an existing bucket like `evidence/`, or
  extend the ADR's enumeration to name them) or **illustrative/non-exhaustive**
  (so extra root files are fine as-is and no further action is needed, beyond
  possibly softening the ADR's "paths make package membership discoverable"
  claim). Still needs the PO's answer; item stays open.

## Triage — question 1 decided 2026-08-18, item closed

- **PO decision (verbatim intent):** "ja es muss der pipeline möglich sein
  hier weiteren sinnvollen inhalt bereitzustellen der zu der jeweiligen
  session passt" — the enumeration is **illustrative/non-exhaustive**, not a
  closed set. A package root may carry further session- or
  feature-appropriate artifacts beyond the core list; this is normal
  practice (confirmed independently recurring in both Phoenix and Nova), not
  a violation to fix.
- **Done:** `docs/adr/0045-canonical-artifact-topology.md` amended to state
  the enumeration is "the required core, not an exhaustive closed set,"
  name the pattern explicitly (recovery notes, phase plans, point-in-time
  spec-revision snapshots), and soften "paths make package membership
  discoverable" to "paths make the CORE package membership discoverable" —
  no false completeness claim remains. No file relocation needed; no
  drift-check tooling built (would be meaningless against a non-exhaustive
  list).
- **Both questions now closed.** Item closed.
