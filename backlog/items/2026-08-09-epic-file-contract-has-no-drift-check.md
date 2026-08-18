---
schema: pipeline.backlog-item.v1
id: pipeline.epic-file-contract-has-no-drift-check
type: defect
owner: pipeline
status: closed
created: 2026-08-09
source: "Found while preparing the Spec-amendment branch of a Critic finding, by checking first whether comparable files were already listed in specs/sprint-phoenix-epic/spec.md §7. They were not. The finding that raised it had reviewed a sixteen-commit range and could not see the sprint-long pattern."
due: 2026-09-08
---

# The Epic's file contract has no mechanism checking it still matches the tree

## Description

`specs/sprint-phoenix-epic/spec.md` §7 ("Detailed implementation inventory")
declares itself the Epic's file contract and states that "a new
implementation file outside this inventory requires the Elephant to update
the Spec before dispatch." Nothing checks that the inventory still matches
the actual tree, and the consequence is measurable: eight files created
during this sprint are absent from it, confirmed at source (`rg` against
`specs/sprint-phoenix-epic/spec.md`, zero matches for each, both direct and
substring):

- `harness/scripts/check-verify-suite-registration.mjs` — created by commit
  `c40f01d`, subject verbatim: "feat(phx-regcheck): add verify suite
  registration completeness check". This is the decisive instance: a Phoenix
  package id in its own commit subject, registered in the verify gate, and
  absent from §7.
- `harness/scripts/check-critic-contract-citations.mjs` — created `e097b27`
- `harness/scripts/check-skill-spec-coverage.mjs` — created `67bac89`
- `harness/scripts/check-adr-consistency.mjs` and its `.test.mjs` — created
  `f1d254e`
- `harness/scripts/check-doc-reconciliation.mjs` and its `.test.mjs` —
  created `0b2bd67`
- `docs/doc-reconciliation.md` — created `dec2ed4`

All eight were verified individually against §7 with `rg` (and against the
whole spec file, not just §7, as a second pass); none produced a match.

## Triggering situation

Found while preparing the Spec-amendment branch of a Critic finding, by
checking first whether comparable files were already listed in §7. They were
not. The finding that raised it had reviewed a sixteen-commit range and could
not see the sprint-long pattern — the gap is only visible across the whole
sprint, not from any single commit or short range.

## Affected artifact

`specs/sprint-phoenix-epic/spec.md` §7 (the declared file contract) and the
verify gate, which has no check corresponding to it — every other declared
contract in this sprint (verify-suite registration, Critic-contract
citations, skill/spec coverage, ADR consistency, doc reconciliation) now has
a mechanical check; the Spec's own file contract does not.

## Proposal

A mechanical check is achievable without semantic analysis and should be
scoped narrowly: for a feature package that declares a file inventory,
verify that every path the inventory names exists, and report — do not
fail — on tracked files under the roots the inventory covers that it does
not name.

Why the second half reports rather than fails: an inventory is a statement
of intent, not a whitelist of the filesystem, and a check that failed on
every unlisted file would be turned off within a day. The eight files this
item names are not violations to reverse — the PO's disposition of
2026-08-09 was to acknowledge the drift as a documented, repeated practice
rather than to carve out an exception for one night's five files. That
disposition is only defensible if the gap that produced it is recorded: a
contract whose subject has drifted from it repeatedly, unnoticed, has
stopped describing that subject. Repairing the last five entries and leaving
the mechanism absent would make the inventory look maintained while
remaining exactly as stale.

Explicitly **not** proposed: editing §7 itself. That is a separate decision
the PO has already dispositioned in the other direction (accept the drift as
practice, not as something this item silently repairs by rewriting the
inventory).

## Triage — 2026-08-18

- **Decision:** ACCEPTED for implementation as an ordinary bounded dispatch. Confirmed still live: no mechanical check anywhere in `harness/scripts/` (Phoenix) or its Nova sibling validates an Epic's declared file inventory (`specs/sprint-phoenix-epic/spec.md` §7) against the tracked tree.
- **Rationale:** The Proposal is already narrowly scoped and technically unambiguous — verify every path the inventory names exists; report (do not fail) on tracked files under the inventory's covered roots that it does not name. The one question needing a PO judgment call (whether to edit §7 itself to add missing entries) is explicitly out of scope and already dispositioned separately. What remains is a standard new-check-plus-registration task, same shape as the sprint's other drift checks.
- **Assignment (if accepted):** A Goldfish dispatch to add `harness/scripts/check-epic-file-contract.mjs`, with its own `.test.mjs`, registered in `harness/scripts/verify.mjs`'s `TEST_SUITES` list (TP-3-protected, needs the standard override handling).
- **Date:** 2026-08-18

## Triage — closed 2026-08-18

- **Decision:** closed — resolved.
- **Rationale:** `harness/scripts/verify.mjs:561` registers `epic-file-contract-tests`; `harness/scripts/check-epic-file-contract.mjs` exists on disk and runs correctly (16/16 tests pass; live run against the real tree correctly exits 2 with 7 genuine pre-existing MISSING-FILE findings from the documented 2026-08-09 ADR renumbering — correct-by-design, not a bug). Landed commits `78137b1a`/`3f9bc6b8`.
- **Date:** 2026-08-18
