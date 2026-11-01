# Held patch notes — pinned assertion count of the course admission suite after N38 (candidate 15c)

Patch: `w18b-pin-count-of-the-course-admission-suite-after-n38.patch`. Apply LAST among the code patches (after `w13`, `w18`, `w14` and the others): it was generated on the full 15c stack
and does NOT apply on the bare tree, because its hunk sits next to the pin hunk of the N21 patch (`w13`).

## What

`harness/scripts/check-verify-case-completion.test.mjs`: the pinned `top-level-assertions` count of `critic-course-admission-tests` 334 -> 340, plus a dated comment line
(QG-04: only this number changes; names, paths, classifications and the identity digest stay). The 6 comes from the one case `w18` appends to the suite (6 `assert.` occurrences).

## Evidence

Rehearsal of the 15c apply script on a clean clone applies it as the last patch; the case-completion suite then passes (see the 15c evidence in the commit that adds the step).
Without this patch the case-completion suite fails on the count after `w18` (measured). Pending: Full Verify, batch Critic, native runs, PO acceptance.
