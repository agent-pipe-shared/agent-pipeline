# w190 — the control-plane scan module and the push gate path modules are registered in the guard pins (candidate 19c, found while checking the Goldfish slices)

Delta on w166 (independent of the other 19c patches). While running the regression suites of the Goldfish slices in a clone, two guard pin suites were red at the base state that the PO applied (candidate 19, patches w131 and w158/w159), so the reds are defects of candidate 19 itself, not of the slices:

- `lib/guard/guard-split-contract.test.mjs` GSC01/GSC02: `lib/guard/control-plane-script-scan.mjs` (w131, Q5) is imported by `evaluate.mjs` but not a module of `harness/guard-split-map.json`. GSC05: it is not in `NEVER_LIFTABLE_KERNEL_PATHS`.
- `lib/guard-maintenance-window-kernel-closure.test.mjs` GMWKC01: `lib/record-only-paths.mjs` (w158) and `lib/evidence-freshness-codes.mjs` (w159) are imported by kernel path sources (`release-promotion-envelope.mjs`, `push-prepare.mjs`, `push-gate-satisfiability.mjs`) but not in `NEVER_LIFTABLE_KERNEL_PATHS`; GMWKC03: `docs/guard-maintenance-window-threat-model.md` must name every entry.

## What it changes

- `harness/guard-split-map.json`: the module `control-plane-script-scan` at layer 2 (its only import is `verdict`, layer 1).
- `lib/guard-maintenance-window.mjs`: the three paths are added to `NEVER_LIFTABLE_KERNEL_PATHS`.
- `docs/guard-maintenance-window-threat-model.md`: the three paths are named in the Protected assets section.
- `lib/guard/guard-split-contract.test.mjs`: the pinned module count is restated from 23 to 24 under QG-04 with a comment (the exact-set check next to it stays).

## Checks

- Clone: `guard-split-contract` 5/5, `guard-maintenance-window-kernel-closure` 11/11, `guard-maintenance-window` suite exit 0. `git apply --check` against the 19a state plus w165 and w166: exit 0.

## Not changed / not proven

- The carry-forward reader and the other modules of the opt-in patches need their own kernel entries; the w171 slice owns them. No Full Verify has run; other pin suites may still be red at the base state.
