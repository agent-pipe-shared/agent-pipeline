# A1 predecision verification

This is a candidate-bound evidence summary prepared before the A1 PO
decision. The Verify run used runId `verify-1788510213112-5fb3d50f843de91a`,
candidate `fe3ba097e2b25487d5736b51cf89bef1f2be132a`, and tree
`74759849b82d1736549016b18d93de990b5e2ad8`. Its evidence path is
`evidence/verify-latest.json`.

## Verify result

Overall Verify exit was **2**. Exactly 505 of 506 registered suites exited
0. The sole failure was `verify-suite-registration-check`, exit 2. Its
failure parser readback reported exactly one finding:

`UNREGISTERED plugins/pipeline-core/scripts/enforcement-conformance.test.mjs`

The registration summary was 1 unregistered suite, 4 honoured exclusions, 0
malformed exclusions, and 0 expired exclusions. `security-scan` exited 0;
`license-contract-check` exited 0; and `doc-contract-check` exited 0.

The app-server-specific suites `codex-app-server-health-tests`,
`codex-advisory-app-server-tests`, and `codex-onboarding-app-server-tests`
each exited 0. This records only those suite outcomes and makes no broader
uptime claim.

The A1 direct suite was rerun after the full Verify run, at the unchanged
exact candidate and tree, with:

`node --test plugins/pipeline-core/scripts/enforcement-conformance.test.mjs`

It exited 0. This was a separate direct execution, not a suite executed
inside Verify.

## Gating consequence

The deterministic Verify chain is not green because the A1 suite remains
unregistered. Under the Critic prerequisite, Critic was correctly not
dispatched; no Critic claim exists for A1. A PO TP-3 registration act,
together with the matching capability surface, remains necessary after A1-2
and the schema decision are settled.

No source mutation occurred during the run. The tracked working tree was
clean afterward. No push, network access, or publication occurred.
