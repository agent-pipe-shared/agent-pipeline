# W9 N42 follow-up: the calibration gate refusals name the commit order

Built by the Elephant (PO exception: small items in a scratch clone, held as a patch). Stacks on `w9-calibration-gate-refusals-name-the-mirror.patch` (candidate 851d76c5f in the clone = HEAD 65e0a0984 + that patch).

## Why
The Toolbox ran the N42 route live: the warning about the mirror was enough, the ORDER was not. Every override signature binds to the exact HEAD, so the second ceremony can only run after the first file is committed; touching the mirror earlier left Verify red with PCI-CALIBRATION-DRIFT between the two commits.

## What changed
- GS-10 and GS-11 refusal texts add one sentence: every override binds to the exact HEAD, so commit this file first, only then touch the mirror and plan its override; run Verify after both commits.
- Test: the existing mirror case is renamed from `GST39` to `GST41` and asserts the two new fragments. The rename fixes a defect of the N42 patch itself: the base already has a case `GST39` (inactive repository), so the earlier patch introduced a duplicate case id.

## Evidence
- `guard-gate-strength.test.mjs` 42 passed, 0 failed in the clone (log `c1`).
- Revert proof: with the production file reverted to the stacked candidate the file exits 1; restored byte-equal.
- Patch applies on the stacked candidate (`git apply --check`, exit 0).

## Not verified
Native Windows run, Full Verify on the assembled candidate (fv9), batch Critic, PO acceptance. The Toolbox also reports the shell guard refuses `git diff --no-index` with a calibration path in the argument; not changed here (byte equality is checked with a hash tool).
