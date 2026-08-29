---
schema: pipeline.backlog-item.v1
id: pipeline.registering-a-verify-suite-silently-invalidates-the-capability-inventory
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: none
source: "Measured live, 2026-08-27 session: two more product-capability-inventory breakages within the same evening, the second within the hour of a session that had just repaired the first — following two prior instances on 2026-08-19."
done_when: contains harness/scripts/check-product-capability-inventory.mjs NVA-INVDERIVE-1
---

# Registering a verify suite silently invalidates the capability inventory, and nothing links the two files

## Description

`harness/scripts/check-product-capability-inventory.mjs` discovers a
`verify-phase` surface for every entry in `verify.mjs`'s suite arrays, and
then requires two things of `docs/product-capability-inventory.json`: that
its declared surfaces exactly cover the discovered current set, and that
every surface belongs to exactly one capability. Registering a single new
suite in `verify.mjs` therefore requires two separate hand edits to the
inventory, made in two different places in that file. Nothing in the
registration path tells the person adding the suite this. The failure only
appears later, as a red Verify entry whose message names neither
`verify.mjs` nor the suite that was just added.

## Triggering situation

This has now happened four times. Twice on 2026-08-19, both filed and
closed: `pipeline.product-capability-inventory-missing-two-new-guard-hooks`
and `pipeline.product-capability-inventory-two-guard-hooks-uncategorized`.
Twice more on 2026-08-27, in a single evening: first five surfaces after
commit `4630dd26` registered five suites, then — within the hour, by the
same session that had just repaired it — one more surface after commit
`acff1372` registered a sixth.

**The recurrence is the finding.** Each previous fix added the missing
entries to the inventory; none removed the reason the entries go missing.
An instance fix on a coupling defect buys one commit of quiet.

## Affected artifact

- `harness/scripts/verify.mjs` (the suite arrays that drive discovery)
- `harness/scripts/check-product-capability-inventory.mjs` (the check that
  discovers surfaces and enforces exact coverage plus single-categorization)
- `docs/product-capability-inventory.json` (the file that must be hand-kept
  in sync, in two separate places, with no signal at registration time)
- `harness/scripts/check-suite-registration.mjs` (the existing registration
  check that does not yet also check inventory coverage)

## Proposal

Options, not a decision:

1. Derive the `verify-phase` surfaces from `verify.mjs`'s own arrays
   instead of duplicating them in the inventory — the data already exists
   in one place, and a derived value cannot drift.
2. Failing that, have `check-suite-registration.mjs` also report inventory
   coverage, so the gap surfaces at the moment of registration rather than
   at the next full Verify run.
3. Weakest: document the two-step (add surface, categorize surface) in the
   registration path itself.

Option 1 removes the class of defect; options 2 and 3 only shorten the
feedback loop between causing it and discovering it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, option 1 (derive the `verify-phase` surfaces from
  `verify.mjs`'s own arrays); options 2 and 3 rejected as the fix
- **Rationale:** Four occurrences, the last two within one evening and the second
  of those by the very session that had just repaired the first. That is the
  finding, and it is decisive: each previous fix added the missing entries and
  none removed the reason they go missing, so an instance fix on this coupling
  buys exactly one commit of quiet. Option 2 shortens the feedback loop and
  option 3 documents the trap — both leave the duplication that causes it. The
  data already exists in one place; a derived value cannot drift, and that is the
  only shape that ends the class.
  Cost note for whoever picks it up: the inventory also demands that every
  surface belong to exactly one capability, which is a judgement the arrays do
  not carry. Deriving the surface set does not automatically derive its
  categorization, so the fix is "derive the set, keep categorization declared,
  fail only on an uncategorized derived surface" rather than a straight deletion
  of the declared block.
- **Assignment (if accepted):** `sprint: none` — reassigned off Alfred. By scope
  this is Alfred's ("mechanical governance, measurable rigor"), Alfred is in
  flight and closed to new scope (PO, 2026-08-28), and neither Nightwing
  (product experience) nor Batman (optional capabilities) describes an internal
  verify-harness coupling. It carries the explicit "no planning window"
  declaration rather than a mis-assignment.
  **Condition for picking it up:** the next window that touches `verify.mjs`'s
  suite registration or `check-product-capability-inventory.mjs`, or Alfred's
  successor whenever control-integrity scope reopens. It is the second item to
  land on `none` for this reason (with
  `pipeline.three-independent-copies-of-the-wsl-windows-path-normalization`);
  two is a signal that Alfred's successor has a waiting queue, not that `none` is
  a parking lot.
- **Date:** 2026-08-28
