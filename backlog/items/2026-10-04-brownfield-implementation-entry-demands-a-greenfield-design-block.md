---
schema: pipeline.backlog-item.v1
id: pipeline.brownfield-implementation-entry-demands-a-greenfield-design-block
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Live observation, Claude Code session on native Windows, 2026-10-04, feat/sprint-alfred at ae7ef5a23, lifecycle approved (final design-workflow package signed and approved)."
sprint: alfred
done_when: manual
---

# A brownfield repository cannot enter implementation: entry readiness demands a greenfield architecture design block

## Description

After a valid final design-workflow approval, `pipeline-state.mjs set-phase
--phase implementation` is refused with `ARCHITECTURE-DESIGN-PACKAGE-REQUIRED`
and `nextAction.kind: "architecture-design-required"`, guidance "Complete the
architecture design block in this exact PO-bound PRD, then present and approve
a new final design-workflow package".

The repository is brownfield: it has an existing architecture map rather than
the fresh greenfield scaffold, and its architecture adoption is PO-deferred.
The demanded block cannot be satisfied there: `parseArchitectureDesign`
requires `repositoryKind: "greenfield"`. Following the guidance would cost a
full design revision cycle plus another PO signature and still fail.

Source cause:

- `inspectArchitectureDesignDraft` (`lib/architecture-design.mjs`) exempts
  repositories without the byte-exact fresh scaffold (`required: false`), so
  `submit-plan` accepts a brownfield PRD without the block.
- `inspectArchitectureDesign` (same file) calls `parseArchitectureDesign(prd)`
  unconditionally after the approval checks, with no equivalent exemption.
- `inspectArchitectureEntryReadiness` (`lib/architecture-entry-readiness.mjs`)
  short-circuits on `ARCHITECTURE-DESIGN-PACKAGE-REQUIRED` before the
  adoption-disposition path that handles `deferred`.

Draft time and implementation entry apply different applicability rules to the
same PRD. The check arrived with the 0.7.0 test candidate (`1bd1d7bf6`).

PO direction (2026-10-04, chat): for brownfield repositories architecture
fitness is optional and is corrected only when the PO asks for it.

## Triggering situation

First `set-phase --phase implementation` after the signed final approval of
the revision-4 Alfred design package (2026-10-04).

## Affected artifact

`plugins/pipeline-core/lib/architecture-design.mjs` (`inspectArchitectureDesign`,
`materializeArchitectureDesign`); consumer
`plugins/pipeline-core/lib/architecture-entry-readiness.mjs`.

## Proposal

Apply the draft inspector's greenfield-applicability predicate in
`inspectArchitectureDesign`: with no materialization receipt and no fresh
scaffold, return a typed `ok: true` / `status: "not-required"` result so entry
readiness falls through to the adoption disposition. Greenfield behaviour stays
unchanged. Positive and negative tests in a consumer-layout fixture on the
win32 and POSIX dialects, including the `project-onboarding-v3` consumer
(which recommends `reopen-design` on any `ok: false` result in the approved
state).

Operator hotfix 9 unblocks this repository until the source fix lands; the
source fix replaces it (W0-3 port).

## Second gate, same class (found after hotfix 9)

With hotfix 9 applied, the writer-side `inspectArchitectureEntryReadiness`
returned `ready`, but the PreToolUse guard still refused the transition:
`GUARD-ARCHITECTURE-FITNESS-NON-GREEN: planning architecture fitness is
blocked` (remedies `authority-effect-ownership:localize-contract`,
`navigation-currency:restore-navigation-bundle`).
`architectureFitnessAuthorityVerdict` in `hooks/guard-lifecycle-ready.mjs`
evaluates fitness itself and ignores a PO deferral, while the library treats a
deferral (with valid physical artifacts) as report-only. Two gates for one
transition apply two different rules.

Operator hotfix 10 (2026-10-04) admits findings-bearing fitness only when the
disposition is `deferred` AND the library entry gate reports `ready`; missing
map, unavailable evaluator, missing surface and every other disposition still
block. With hotfixes 9 and 10 applied, `set-phase --phase implementation`
succeeded on 2026-10-04.

The source fix should leave exactly one implementation-entry rule, owned by
the library, which the guard calls rather than re-deriving it.

## Model gap (PO, 2026-10-04)

The model knows "fresh greenfield scaffold" vs. "everything else" plus an
adoption disposition. It has no explicit "established/active" state for a
repository whose map, fitness model and baseline exist. In that state the
accepted baseline should keep ratcheting (net-new or worsened findings block,
accepted ones stay frozen) even while full adoption is deferred. Hotfix 10 is
an interim unblock, not this target model. Owner: D3/D4.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
