# W7-REBIND-TEXT -- notes (state: HELD, built by the Elephant in a scratch clone under the D192 exception)

Candidate `009e426db`. Patch: `w7-plan-approval-stale-repair-names-rebind-approval.patch` (3 paths, apply-check exit 0; the whole eleven-patch chain applies in script order). Backlog item: `2026-10-26-transfer-invalidates-plan-approval`.

## What it delivers (repair text only)

After a clone or transfer the plan approval still holds, but its device-local values differ, so the readers answer `CVCT-AUTHORITY-STALE` or `CVCT-PROFILE-STALE`. The two repair lines used to say only "approve the plan again" and never named the route that exists for this case.

- `lib/native-goldfish-host-state.mjs` `staleApprovalRepair`: names `pipeline-state.mjs rebind-approval` first (re-checks every bound digest, takes no argument, asks for no new approval) for a clone or transfer with unchanged approved bytes, and keeps `submit-plan` plus a new PO approval for the case that the approved bytes themselves changed.
- `lib/calibration-verify-commit-transition.mjs` `configureVerifyRepair`: the same two-way line for the configure-verify refusal.
- `lib/pins/stale-approval-repair-names-rebind-approval.test.mjs` SAR01-SAR03: both texts name `rebind-approval` and keep the re-approval route; other codes do not name it.

## Checks (scratch clone)

- New pin: 5 tests pass.
- `scripts/rebind-approval.test.mjs` and `lib/native-goldfish-host-state.test.mjs`: exit 0.
- `lib/pins/configure-verify-names-the-unmet-approval-condition.test.mjs`: three case-A fixtures fail, and fail identically on the unchanged baseline clone (known red, not from this patch).

## NOT in this patch (row stays open)

- inspect, bootstrap and the transfer plan do not yet name `rebind-approval`; only the two refusal texts do. The text cannot tell a device-only difference from a changed byte, so it names both routes; a discriminator would use `differsOnlyInDeviceFields` and is a follow-up.
- `rebind-approval --help` and the State file mode repair (0644 after transfer) are untouched.
- The PO question on the `R75_INSPECT` trigger state and the native cross-machine transfer run remain open.
- Full Verify, batch Critic and PO acceptance remain pending. Kernel-adjacent path: the PO applies the patch in the same ceremony.
