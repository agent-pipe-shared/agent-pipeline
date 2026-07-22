# Native Windows host evidence — runtime baseline containment

Date: 2026-07-22
Backlog item: `pipeline.windows-runtime-baseline-containment` (Issue `#33`)
Status: **partial candidate evidence only; no transition or closure claim**

## Attested host observation

The PO-provided Windows-session attestation observed candidate
`46a57341aa702ffb74c394f1f32340c6fa4b8702`, which contains the containment
implementation commit `fbe716215ce821f93c67b0bc240aea52c1800eac`.

- Windows 11 Home `10.0.26200`, native NTFS drive, standard non-elevated user;
- Node `v24.15.0` and Git for Windows `2.55.0.windows.3`;
- `node setup.mjs` emitted the V3 source/runtime no-op result: the V3 source
  and runner-neutral advisory projections were current and setup performed no
  writes;
- the process exit was `2` only because toolchain preflight reported
  `TCP-BINARY-MISSING` for an installed Git. This is the independently scoped
  `#37` resolver defect, not a `#33` containment failure; and
- `runtime-projection-v2.test.mjs` passed `20/20` and
  `runtime-projection-v3.test.mjs` passed `17/17`, including the shared
  physical containment case for a valid missing V3 target.

The pre-fix native invocation had failed at the V3 baseline with an unsafe
owned target path / unreadable runtime. The reported no-write V3 result is
therefore the relevant native #33 signal. This record intentionally omits the
machine-local workspace path.

## Remaining gates

No native-Windows aggregate `node harness/scripts/verify.mjs` run is claimed:
the current native aggregate is red for separate `#36` fixtures. No independent
Critic is claimed by the Windows session. The canonical item remains `open`
until aggregate candidate evidence, Security evidence, independent Critic and
the sanctioned backlog transition are complete.
