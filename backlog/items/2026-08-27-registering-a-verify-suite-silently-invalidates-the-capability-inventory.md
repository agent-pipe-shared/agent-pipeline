---
schema: pipeline.backlog-item.v1
id: pipeline.registering-a-verify-suite-silently-invalidates-the-capability-inventory
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Measured live, 2026-08-27 session: two more product-capability-inventory breakages within the same evening, the second within the hour of a session that had just repaired the first — following two prior instances on 2026-08-19."
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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
