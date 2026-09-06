---
schema: pipeline.backlog-item.v1
id: pipeline.registering-a-verify-suite-silently-creates-an-inventory-obligation
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-06
source: "manual observation -- two occurrences on 2026-09-06: defe7013 (NVA-B-BLOCKE-FOLLOWUP-1, two suites) and ec0b158c (stage-0, guard-slicing-tests), each a full gate run red on product-capability-inventory-tests after a suite was registered in harness/scripts/verify.mjs"
sprint: nova-b
done_when: manual
---

# Registering a verify suite silently creates an inventory obligation

## Description

`harness/scripts/check-product-capability-inventory.mjs` discovers every
`verify-phase:harness/scripts/verify.mjs:<suite>` surface and fails when a
discovered surface is absent from every capability in
`docs/product-capability-inventory.json`. Registering a suite in `verify.mjs`
therefore always creates a second, separate edit obligation in the inventory
— and nothing at the registration step says so. Twice in one day the
obligation was discovered by the next full gate run turning red, once ten
minutes after a PO signature had been spent on the registration itself
(TP-3 protects `verify.mjs`; the inventory is not protected, so the two
edits cannot even share a ceremony).

## Triggering situation

- `defe7013` (2026-09-06 morning): `verify-evidence-writer-tests` and
  `dispatch-record-strip-for-critic-tests` registered; the inventory and a
  fixture list had to follow in a separate dispatch after the gate went red.
- `ec0b158c` (2026-09-06 evening): `guard-slicing-tests` registered under PO
  signature (`eecb4273`); the first full run bound to `2dca9b8d` came back
  515/516 with the inventory suite as the one red; fixed by one line.
- `8d76e28d` (2026-09-06 night, a third trigger and a third obligation): the
  release-line corrections edited `docs/operating-model.md`, which is vendored
  into the plugin as `plugins/pipeline-core/docs/operating-model.md`. The
  vendored copy was not regenerated, and the next full gate went red on TWO
  suites — `generate-vendored-canon-tests` directly, and `doc-contract-tests`
  through its own check that every shipped vendored link exclusion is
  justified by a byte-identical origin. One stale generated file, two red
  suites, neither of them the one whose file was edited. The remedy is a single
  command (`node harness/scripts/generate-vendored-canon.mjs`) that nothing at
  the editing step names.
- `c784a462` (2026-09-06 evening, same class, a second inventory): the
  ADR-0080 acceptance renamed `docs/adr/draft-…` to `docs/adr/0080-…`
  (`07d6041f`); `governance/observation-doc-governance.json` still listed
  the draft path and the accepted path was unclassified, so the first full
  gate at the stamped candidate went red on `observation-governance-tests`
  and `doc-contract-tests`. A rename creates the same hidden obligation as
  a registration; `check-adr-consistency.mjs` (run green by the acceptance
  dispatch) does not look at that inventory.

## Affected artifact

- `harness/scripts/check-verify-suite-registration.mjs` (the checker that
  already knows every registered suite) and its test.
- `harness/scripts/check-product-capability-inventory.mjs`.
- The TP-3 ceremony practice: `backlog/evidence/2026-09-06-po-decision-queue.md`
  item 1 described the edit as "two lines" — it is two lines in `verify.mjs`
  plus one in the inventory.

## Proposal

Make the obligation visible at the registration step rather than at the next
full gate: `check-verify-suite-registration.mjs` (already run standalone
before and after a TP-3 edit) additionally reports every registered suite
with no `verify-phase:` surface in the inventory, as a named finding with the
exact line to add. The inventory gate stays where it is; the registration
checker only gains the earlier warning. Alternative, cheaper: a sentence in
`docs/pending-verify-registrations.md` and in the TP-3 ceremony note that a
registration is not complete until the inventory line exists.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
