# Held patch notes — the handover size denial names the extraction acknowledgment step (N28, candidate 15c)

Patch: `w25-handover-size-denial-names-the-extraction-acknowledgment-n28.patch`. Independent of the other 15c patches (applies on the bare tree).

## What

`hooks/guard-handover-size.mjs`: the `HANDOVER-ROTATION-REQUIRED` denial now says that the rotation refuses with `HANDOVER-EXTRACTION-NOT-ACKNOWLEDGED` until the section was read for embedded durable rules
with no home yet (ADR-0066 Decision 7), names the exact command (`handover-rotate.mjs --root <repository-root> --acknowledge-extraction-done --section-heading "<block heading>"`, once per section),
and says it is deliberate review work, not a formality, and that a changed section needs a new acknowledgment. No gate, threshold or admission rule changes.

`hooks/guard-handover-size.test.mjs`: the existing at/over-cap assertion that checked the script path also checks the new text (code name and the acknowledgment flag). The assertion was extended in place
(no new `assert.` occurrence), so no pinned assertion count moves; this suite is not in the case-completion registry's pinned counts.

## Evidence

- Suite 1/1 and the case-completion suite together 33/33.
- Mutation: changing the code name in the text turns the suite red. (A first mutation that only appended a character stayed green because the checked string is a prefix of it; discarded, and the restated assertion still pins the exact name.)

## Not covered

- The text is static; it does not list which sections are already acknowledged (the item's alternative). No Full Verify, native Windows run or Critic. Pending: batch Critic (paused by the PO), native runs, PO acceptance.
