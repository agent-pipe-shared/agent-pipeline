# Held patch: D203 move-aside also takes a producer left drifted after heal

Built by the Elephant under the PO exception for small items (2026-10-30), in a scratch clone at 69ce588e7. Held; applied only by the PO.

## Defect (live, this repository, 2026-10-30)

After a Goldfish returned, `routine-repair.mjs run heal` retired its settled pending state and then ended
`SAR-HEAL-INCOMPLETE`: producer `native-goldfish` stood `drifted` (`native-goldfish-host-commit`) and the registry read
refused `SDC-AUTHORITY-CAS native-goldfish:namespace-drift`. The heal result named no next step, and
`routine-repair.mjs run move-aside --no-goldfish-running` refused `RR-OUTSIDE-LIST`, because the D203 rule counted only
`reconcile-refused` producers. `session-authority-repair.mjs move-aside --no-goldfish-running` then repaired it at once.
D203 says the agent moves such a producer aside itself; the routine did not.

## Change

`lib/routine-repair.mjs` `classifyInspectFindings`: a producer with status `drifted` is heal-first like a
`reconcile-refused` one, and a registry read refusal whose reason names such a producer (`<producer>:...`) is too. So
`heal` reports `stillReconcileRefused` with the move-aside `next`, and `move-aside` heals first, then moves aside only
what is still refused. A read refusal naming any other producer, and every other finding, stays outside the list.

## Evidence (clone)

- `lib/routine-repair.test.mjs` 33/33: the exact live inspect (`driftedLive`) admitted through heal then move-aside; a
  heal ending SAR-HEAL-INCOMPLETE names the move-aside routine; a read refusal naming another producer stays refused.
- QG-04 restatement: the table row "refuse: move-aside with another finding" used a `drifted` producer as its example of
  an outside finding; it now uses an `unreadable` producer, intent unchanged.
- Revert proof: with `lib/routine-repair.mjs` at the candidate the two new live-shape cases fail; restored byte-equal.
- Green neighbours: `lib/native-goldfish-host-state.test.mjs` 62/62, `scripts/dispatch-briefing.test.mjs` 131/131.
- `git apply --check` on a fresh clone at the candidate: exit 0.

## Not covered

Full Verify, Critic review and PO acceptance are open.
