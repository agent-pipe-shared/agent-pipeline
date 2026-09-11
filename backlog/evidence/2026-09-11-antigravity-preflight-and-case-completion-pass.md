# Antigravity dispatch preflight and case-completion review

Date: 2026-09-11

Two ordinary fresh-session Critic reviews cover the Antigravity dispatch-host
hardening and its follow-up Verify integration. Both used
`functional-equivalent-read-only` assurance; OS isolation was not asserted.
Native Codex sandbox behavior under WSL is outside this evidence.

## Dispatch boundary

The first Critic reviewed commit `e967a18a8300cca0a390d6d96ab1533087b3f2d1`
and returned **PASS with no findings**. The exported `invokeAgy()` boundary
requires the complete packet, physical root and result root; it validates the
exact candidate, required inputs, role, transport and result destination before
the module-private process launcher can run. The valid path preserves the
prompt bytes and launches from the admitted root. Invalid cases prove zero
launcher and model calls.

This closes the late-rejection defect at the public host wrapper. No in-repo
production coordinator currently calls that wrapper, so the broader backlog
item remains open rather than claiming an integration that does not exist.

## Verify case completion

The second Critic reviewed commit
`db1ceabeaab0a410ed36a00cc95a5b3ee46900fd`, tree
`82613f132cce1cf1f874c79a68a08b9bb9673b53`, and returned **PASS with no
findings**. It confirmed:

- `EPH01` through `EPH18` and `LWSC01` through `LWSC10` exactly match their
  normal Verify policies;
- both suites declare their complete corpus before the shared registrar starts
  independent `node:test` cases;
- the registry marks both suites `required`; and
- the TP-3 Verify edit strengthens completion evidence without removing a
  suite, skip, threshold or gate.

Focused execution passed 18/18 Antigravity cases and 10/10 supervisor CLI
cases. The completion registry reports 181 entries, with 15 required and 166
explicit legacy entries; suite registration remains 529/529.
