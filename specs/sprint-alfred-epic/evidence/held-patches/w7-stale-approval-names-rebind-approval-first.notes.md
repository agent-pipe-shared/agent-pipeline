# A stale approval names rebind-approval before reopen-design (PO exception: Elephant builds small items, 2026-10-30)

Held patch `w7-stale-approval-names-rebind-approval-first.patch`, built by the Elephant in a scratch clone at 1625724d4. Nothing applied.

## Behaviour

When onboarding `inspect` sees a drifted approval whose next action is `reopen-design`
(`designToImplementationHandoverAction` in `lib/project-onboarding-v3.mjs`), its guidance now names
`pipeline-state.mjs rebind-approval` first for a clone or transfer with unchanged approved bytes: rebind-approval
re-binds only the device-local fields and keeps the approval, while reopen-design discards it. reopen-design follows
only if the rebind refuses. The action shape is unchanged (same collect-input, same apply argv), so the ready gate
admits it as before; only the guidance text changed, and the gate checks guidance only for a non-empty string.

Why text and not a second action: the ready gate (`project-onboarding-ready-gate`) pins the exact reopen-design
shape and refuses any extra key, so a second structured action would also change the gate. That stays open as its own
slice; the todo test in `scripts/rebind-approval.test.mjs` (the inspect fixture never reaches the ready branch) is
unchanged.

## Files

- `plugins/pipeline-core/lib/project-onboarding-v3.mjs`: guidance string plus a two-line comment.
- `plugins/pipeline-core/lib/project-onboarding-ready-gate.test.mjs`: the mirrored literal `REOPEN_STALE_GUIDANCE`.

## Evidence (scratch/agent-out/w7stale logs, clone vs clone2 baseline)

- project-onboarding-ready-gate 27/27; pins approved-lifecycle-state 5/5, foreign-worktree 19/19, brownfield-entry 16/16.
- project-onboarding-v3.test.mjs: clone and baseline fail the same five checks (NVA-R40-PROJDRIFT, seeded push gate,
  SECGATE-1, handover codex, handover antigravity); none new.
- Revert proof: with only the producer reverted, the ready-gate mirror test fails; restored byte-equal.
- Apply-check on the plain candidate exit 0.

## Not verified

Whether the guard admits `rebind-approval` in that drifted session state (the stale-approval repair texts already name
it), Codex/Antigravity live, Windows, Full Verify, Critic, PO acceptance.
