# Design input — Nova human authorization and Cyborg handover

**Capture date:** 2026-08-02

## Material direction

The Product Owner requires the released Cyborg detached-human-proof adapter to
cover only genuine external-effect gates, not ordinary chat-based plan and
implementation decisions. The critical set is remote push, human-gated deploy
and release publication. A remote-app one-time code is requested to permit
temporary, bounded continuation while away from the hardened signing terminal;
the final push gate must still require external proof. Nova must also perform
the Cyborg handover's six evidence-bound canonical backlog transitions.

## Constraints

- The existing hardened external Ed25519/SSH signing path is already tested.
- No secret, passphrase or code may become agent-held authentication material.
- A chat-visible code is not a final human proof.
- A code cannot authorize an irreversible action.
- No remote operation is authorized by this design package.

## Source trace

This package is a focused staging view of
[`../sprint-nova-epic/design/2026-08-02-human-authorization-extension-input.md`](../sprint-nova-epic/design/2026-08-02-human-authorization-extension-input.md),
which contains the detailed decisions, limits and rationale.

