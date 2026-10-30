# Held patch: a briefing package carries an effort escalation

Built by the Elephant under the PO exception for small items (2026-10-30), in a scratch clone at 9424f1969. Held; applied only by the PO.

## Defect

The binding generator admits an agent definition effort above the configured Claude route effort only with the
`--effort-escalation MP-05|MP-07` flag. A closed briefing package (`build`/`probe`) had no key for that act, so a
`goldfish-deep` package under a route at `medium` was always refused with DBG-EFFORT-ROUTE-CONTRADICTION: the generator
route had no way to dispatch a deliberate deep-tier escalation.

## Change

- `lib/dispatch-briefing-build.mjs`: `effortEscalation` is an optional package string.
- `scripts/dispatch-briefing.mjs`: `packageBindingOptions` passes it to the binding, which stays its only validator; the
  usage text names it; the DBG-EFFORT-ESCALATION-UNKNOWN and DBG-EFFORT-ROUTE-CONTRADICTION repairs name the package key.

## Evidence

- `node --test plugins/pipeline-core/scripts/dispatch-briefing.test.mjs` in the clone: 132/132 green.
- New case: MP-05 and MP-07 in a package bind the same effort and the same DBG-EFFORT-ESCALATION warning as the flag;
  `"because"` is DBG-EFFORT-ESCALATION-UNKNOWN naming the key; `""` is DBG-PACKAGE-FIELD-TYPE; an absent key is
  DBG-EFFORT-ROUTE-CONTRADICTION naming the key.
- Revert proof: with `scripts/dispatch-briefing.mjs` back at the candidate the new case fails; restored byte-equal.
- `git apply --check` on a fresh clone at the candidate: exit 0.

## Not covered

Full Verify, Critic review, native runs and PO acceptance are open.
