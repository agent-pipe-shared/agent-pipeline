fix(guard): list the four kernel modules candidate 29c added

GMWKC01 found NEVER_LIFTABLE_KERNEL_PATHS no longer closed under the
kernel's imports:
- lib/private-state-write-guard.mjs (hooks/guard-gate-strength.mjs);
- lib/gate-definition-changes.mjs and lib/maintenance-delivery.mjs
  (scripts/pipeline-state.mjs, scripts/po-human-approval.mjs,
  lib/native-goldfish-host-state.mjs);
- lib/close-commit-split.mjs (imported by the change walk).
All four join the list, and the threat model's Protected-assets section
names them and why none can be lifted by a window (GMWKC03).

AI-Assisted: true
Dispatch: stage-0 (elephant)
